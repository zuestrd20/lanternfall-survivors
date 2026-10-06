import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as engine from './engine.js';

// Real app, renderer and simulation; the only substitutes are browser/platform APIs.
// Run with `node --test ui.test.mjs`. No DOM, canvas or browser packages are needed.
const appSource=readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const artSource=readFileSync(new URL('./art.js',import.meta.url),'utf8').replace(/^export /gm,'');
const markup=readFileSync(new URL('./index.html',import.meta.url),'utf8');

function boot(stored=null,options={}) {
  let now=0,raf=null;
  const saved=[],canvasCalls=new Map(),audioEvents=[];
  function makeContext(canvas) {
    const c={canvas,imageSmoothingEnabled:true,globalAlpha:1};
    const stack=[];
    const record=(name,args)=>{
      canvasCalls.set(name,(canvasCalls.get(name)||0)+1);
      for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),`Canvas ${name} received ${value}`);
    };
    for(const name of ['setTransform','clearRect','fillRect','strokeRect','translate','scale','rotate','beginPath','closePath','moveTo','lineTo','arc','ellipse','fill','stroke','drawImage','strokeText','fillText','setLineDash'])c[name]=(...args)=>{record(name,args);if(name==='arc')assert.ok(args[2]>=0);if(name==='ellipse')assert.ok(args[2]>=0&&args[3]>=0);};
    c.save=()=>{record('save',[]);stack.push({globalAlpha:c.globalAlpha,fillStyle:c.fillStyle,strokeStyle:c.strokeStyle,lineWidth:c.lineWidth});};
    c.restore=()=>{record('restore',[]);assert.ok(stack.length,'Canvas restore without matching save');Object.assign(c,stack.pop());};
    c.createRadialGradient=(...args)=>{record('createRadialGradient',args);assert.ok(args[2]>=0&&args[5]>=0);return {addColorStop(offset,color){assert.ok(offset>=0&&offset<=1);assert.equal(typeof color,'string');}};};
    c.stackDepth=()=>stack.length;
    return c;
  }
  const contexts=[];
  let document;
  class Element {
    constructor(tag='div') {
      this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.listeners={};this.style={};this.dataset={};this.attrs={};this.hidden=false;this.disabled=false;this._html='';this.textContent='';this.width=300;this.height=150;this.captures=new Set();
      this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/),...names])].filter(Boolean).join(' ');},remove:(...names)=>{this.className=this.className.split(/\s+/).filter(n=>!names.includes(n)).join(' ');},contains:name=>this.className.split(/\s+/).includes(name)};
    }
    get id(){return this.attrs.id||'';}set id(value){this.attrs.id=String(value);}
    get className(){return this.attrs.class||'';}set className(value){this.attrs.class=String(value);}
    setAttribute(name,value){this.attrs[name]=String(value);if(name==='hidden')this.hidden=true;if(name==='disabled')this.disabled=true;if(name==='width'||name==='height')this[name]=Number(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=String(value);}
    getAttribute(name){return this.attrs[name]??null;}
    get innerHTML(){return this._html;}set innerHTML(value){this._html=String(value);this.replaceChildren();parseInto(this,this._html);}
    append(...children){for(const child of children){child.parentNode=this;this.children.push(child);}}
    replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...children);}
    matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));if(selector.startsWith('['))return Object.hasOwn(this.attrs,selector.slice(1,-1));return this.tagName===selector.toUpperCase();}
    querySelectorAll(selector){const parts=selector.trim().split(/\s+/);let roots=[this];for(const part of parts){const result=[];for(const root of roots){const visit=node=>{for(const child of node.children){if(child.matches(part))result.push(child);visit(child);}};visit(root);}roots=result;}return roots;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);}
    dispatch(type,properties={}){const e={type,target:this,currentTarget:this,button:0,pointerId:1,repeat:false,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...properties};for(const fn of this.listeners[type]??[])fn(e);return e;}
    click(){if(!this.disabled)this.onclick?.({type:'click',target:this,currentTarget:this,preventDefault(){}});}
    focus(){if(!['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(this.tagName)&&this.getAttribute('tabindex')===null)return;for(let node=this;node;node=node.parentNode)if(node.hidden)return;document.activeElement=this;}
    getContext(type){assert.equal(this.tagName,'CANVAS');assert.equal(type,'2d');if(!this.context){this.context=makeContext(this);contexts.push(this.context);}return this.context;}
    getBoundingClientRect(){return {left:0,top:0,width:116,height:116};}
    setPointerCapture(id){this.captures.add(id);}
    hasPointerCapture(id){return this.captures.has(id);}
    releasePointerCapture(id){if(this.captures.delete(id))this.dispatch('lostpointercapture',{pointerId:id});}
  }
  function parseInto(root,html){
    const stack=[root],voidTags=new Set(['AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT','LINK','META','PARAM','SOURCE','TRACK','WBR']);
    for(const m of html.matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>/gi)){
      if(m[0].startsWith('</')){for(let i=stack.length-1;i>0;i--)if(stack[i].tagName===m[1].toUpperCase()){stack.length=i;break;}continue;}
      const el=new Element(m[1]);for(const a of m[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))el.setAttribute(a[1],a[2]??a[3]??a[4]??'');
      stack.at(-1).append(el);if(!voidTags.has(el.tagName)&&!m[0].endsWith('/>'))stack.push(el);
    }
  }
  document=new Element('document');document.hidden=false;document.createElement=tag=>new Element(tag);parseInto(document,markup);
  const window=new Element('window');
  const media=query=>({matches:query.includes('reduced-motion')?!!options.reducedMotion:!!options.coarse,addEventListener(){}});
  class AudioContext {
    constructor(){this.currentTime=0;this.state='running';this.destination={};audioEvents.push('construct');if(options.audioThrows)throw new Error('Audio blocked');}
    resume(){audioEvents.push('resume');}
    createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(g){return g;},start(){audioEvents.push('start');},stop(){}};}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
  }
  window.AudioContext=AudioContext;
  const sandbox=vm.createContext({console,document,window,localStorage:{getItem(){if(options.readThrows)throw new Error('Storage blocked');return stored;},setItem(key,value){if(options.writeThrows)throw new Error('Storage blocked');saved.push({key,value});}},performance:{now:()=>now},requestAnimationFrame(callback){raf=callback;},addEventListener:window.addEventListener.bind(window),matchMedia:media,devicePixelRatio:options.dpr||1,innerWidth:options.width||1100,innerHeight:options.height||760,...engine});
  vm.runInContext(`const {drawWorld,drawPortrait}=(()=>{${artSource}\nreturn {drawWorld,drawPortrait};})();`,sandbox,{filename:'art.js'});
  vm.runInContext(appSource,sandbox,{filename:'app.js'});
  const evaluate=source=>vm.runInContext(source,sandbox);
  const state=()=>evaluate('({selected,game,screen,settings,pointer,axis,dash,keys,prevState,demo})');
  const get=id=>{const el=document.querySelector('#'+id);assert.ok(el,`Missing DOM node #${id}`);return el;};
  const frame=(seconds=1/60)=>{now+=seconds*1000;assert.equal(typeof raf,'function');const callback=raf;raf=null;callback(now);for(const c of contexts)assert.equal(c.stackDepth(),0,'Canvas save/restore must balance');};
  const frames=(count,seconds=1/60)=>{for(let i=0;i<count;i++)frame(seconds);};
  const key=(code,properties={})=>window.dispatch('keydown',{code,...properties});
  const keyup=code=>window.dispatch('keyup',{code});
  const start=()=>{get('start').click();return state().game;};
  const levelUp=(xp=null)=>{const g=state().game;g.xp=xp??g.xpNeeded;frame();assert.equal(g.state,'upgrade');return get('overlay-content').querySelectorAll('[data-upgrade]');};
  const die=()=>{const g=state().game;g.player.invuln=0;g._hurtPlayer(g.player.hp+1);frame();assert.equal(g.state,'dead');};
  return {get,document,window,saved,canvasCalls,audioEvents,contexts,state,evaluate,frame,frames,key,keyup,start,levelUp,die};
}

const plain=value=>JSON.parse(JSON.stringify(value));

test('menu initializes all three real character portraits and selected state',()=>{
  const a=boot(),cards=a.get('characters').children;
  assert.equal(a.state().screen,'menu');assert.equal(a.state().game,null);assert.equal(cards.length,3);assert.equal(cards[0].getAttribute('aria-pressed'),'true');assert.equal(a.get('hud').hidden,true);assert.equal(a.get('menu').hidden,false);assert.ok(a.canvasCalls.get('drawImage')>=3);a.frame();assert.ok(a.canvasCalls.get('fillRect')>100);
});
for(const [index,character] of engine.CHARACTERS.entries())test(`selecting ${character.id} updates one selection and starts correct real loadout`,()=>{
  const a=boot();a.get('characters').children[index].click();assert.equal(a.state().selected,character.id);const cards=a.get('characters').children;assert.equal(cards.filter(c=>c.getAttribute('aria-pressed')==='true').length,1);assert.equal(cards[index].getAttribute('aria-pressed'),'true');const g=a.start();assert.equal(g.character,character.id);assert.equal(g.weapons[character.weapon],1);assert.equal(a.get('menu').hidden,true);assert.equal(a.get('hud').hidden,false);assert.equal(a.get('overlay').hidden,true);assert.equal(a.get('app').classList.contains('playing'),true);assert.equal(a.get('hero-name').textContent,character.name);a.frame();assert.ok(g.time>0);
});
test('touch controls respond to coarse pointers and narrow viewports',()=>{for(const options of [{coarse:true},{width:390}]){const a=boot(null,options);a.start();assert.equal(a.get('touch-controls').hidden,false);}const a=boot();a.start();assert.equal(a.get('touch-controls').hidden,true);});
test('canvas resize uses capped device pixel ratio and keeps renderer valid',()=>{const a=boot(null,{dpr:3,width:390,height:844});assert.equal(a.get('world').width,780);assert.equal(a.get('world').height,1688);a.evaluate('innerWidth=800;innerHeight=600');a.window.dispatch('resize');assert.equal(a.get('world').width,1600);a.frame();});
for(const stored of ['not JSON','null','false','42','"oops"','[]','{"sound":"yes","reduced":0}'])test(`malformed or non-object saved settings stay usable: ${stored}`,()=>{const a=boot(stored);assert.equal(a.state().settings.sound,false);assert.equal(a.state().settings.reduced,false);a.get('sound').click();assert.equal(a.state().settings.sound,true);a.start();a.frame();});
test('storage read failure preserves defaults and does not stop startup',()=>{const a=boot(null,{readThrows:true,reducedMotion:true});assert.equal(a.state().settings.reduced,true);a.start();a.frame();});
test('persisted settings override media default and update accessible controls',()=>{const a=boot('{"sound":true,"reduced":false,"best":125,"wins":2}',{reducedMotion:true});assert.equal(a.get('sound').getAttribute('aria-pressed'),'true');assert.equal(a.get('motion').getAttribute('aria-pressed'),'false');assert.equal(a.get('best').textContent,'最長守夜 02:05');a.get('sound').click();a.get('motion').click();assert.equal(a.get('sound').getAttribute('aria-label'),'開啟音效');assert.equal(a.saved.length,2);assert.deepEqual(JSON.parse(a.saved.at(-1).value),{sound:false,reduced:true,best:125,wins:2});});
test('storage write failures keep settings and death/retry operational',()=>{const a=boot(null,{writeThrows:true});a.get('sound').click();a.get('motion').click();assert.equal(a.state().settings.sound,true);assert.equal(a.state().settings.reduced,true);a.start();a.frames(10);a.die();assert.ok(a.state().settings.best>0);a.get('retry').click();assert.equal(a.state().game.state,'playing');});
test('unsupported audio does not break setting controls or start',()=>{const a=boot(null,{audioThrows:true});a.get('sound').click();assert.equal(a.state().settings.sound,true);a.start();a.frame();});
test('WASD and arrow movement stop on keyup with no diagonal speed boost',()=>{const a=boot(),g=a.start(),x=g.player.x,y=g.player.y;a.key('KeyD');a.key('KeyW');a.frames(6);const travelled=Math.hypot(g.player.x-x,g.player.y-y);assert.ok(Math.abs(travelled-g.moveSpeed*.1)<1e-8);assert.ok(g.player.y<y);a.keyup('KeyD');a.keyup('KeyW');const stop={x:g.player.x,y:g.player.y};a.frames(3);assert.equal(g.player.x,stop.x);assert.equal(g.player.y,stop.y);assert.equal(a.key('ArrowLeft').defaultPrevented,true);a.frames(3);assert.ok(g.player.x<stop.x);});
test('opposed movement keys cancel and gameplay keys do not scroll',()=>{const a=boot();assert.equal(a.key('ArrowUp').defaultPrevented,false);const g=a.start();a.key('KeyA');a.key('KeyD');a.frames(3);assert.equal(g.player.x,1200);for(const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'])assert.equal(a.key(key).defaultPrevented,true);});
test('dash is a single press action and repeat cannot reset recharge',()=>{const a=boot(),g=a.start();a.key('KeyD');a.key('Space');a.frame();assert.equal(g.metrics.dashes,1);assert.ok(g.player.dashTime>0);const cooldown=g.dashCooldown;a.key('Space',{repeat:true});a.frames(20);assert.equal(g.metrics.dashes,1);assert.ok(g.dashCooldown<cooldown);a.keyup('Space');a.key('Space');a.frame();assert.equal(g.metrics.dashes,1);});
test('pause button freezes simulation and repeated toggles leave one overlay',()=>{const a=boot(),g=a.start();a.key('KeyD');a.frame();a.get('pause').click();const {time}=g;assert.equal(g.state,'paused');assert.equal(a.get('overlay').hidden,false);assert.equal(a.state().keys.size,0);a.frames(20);assert.equal(g.time,time);a.get('pause').click();assert.equal(g.state,'playing');assert.equal(a.get('overlay').hidden,true);a.get('pause').click();a.get('resume').click();a.frame();assert.equal(g.state,'playing');assert.ok(g.time>time);});
test('P and Escape toggle pause once per press and clear held movement',()=>{const a=boot(),g=a.start();a.key('KeyD');a.key('KeyP');assert.equal(g.state,'paused');a.key('KeyP',{repeat:true});assert.equal(g.state,'paused');assert.equal(a.state().keys.size,0);a.key('Escape');assert.equal(g.state,'playing');a.frames(6);assert.equal(g.player.x,1200);});
test('upgrade overlay renders current choices, freezes simulation and accepts one click only',()=>{const a=boot(),g=a.start();a.key('KeyD');const cards=a.levelUp();assert.equal(cards.length,3);assert.equal(a.get('overlay').hidden,false);assert.equal(a.state().keys.size,0);assert.deepEqual(cards.map(c=>c.dataset.upgrade),g.choices.map(c=>c.id));const time=g.time,x=g.player.x;a.frames(30);assert.equal(g.time,time);assert.equal(g.player.x,x);cards[0].click();cards[0].click();assert.equal(g.metrics.upgrades,1);assert.equal(g.state,'playing');assert.equal(a.get('overlay').hidden,true);});
for(const digit of [1,2,3])test(`Digit${digit} selects corresponding upgrade and does not repeat`,()=>{const a=boot(),g=a.start();a.levelUp();const c=g.choices[digit-1],previous=c.kind==='weapon'?g.weapons[c.id]:g.passives[c.id];a.key(`Digit${digit}`);assert.equal(g.metrics.upgrades,1);assert.equal(c.kind==='weapon'?g.weapons[c.id]:g.passives[c.id],previous+1);a.key(`Digit${digit}`,{repeat:true});assert.equal(g.metrics.upgrades,1);});
test('pause commands during upgrades cannot dismiss or bypass the choice',()=>{const a=boot(),g=a.start();a.levelUp();a.get('pause').click();a.key('Escape');a.key('KeyP');assert.equal(g.state,'upgrade');assert.equal(a.get('overlay').hidden,false);assert.equal(a.get('overlay-content').querySelectorAll('[data-upgrade]').length,3);});
test('back-to-back levels refresh displayed choices and reject stale button activation',()=>{const a=boot(),g=a.start();const first=a.levelUp(100);const oldLevel=g.level;first[0].click();assert.equal(g.state,'upgrade');assert.equal(g.level,oldLevel+1);const next=a.get('overlay-content').querySelectorAll('[data-upgrade]');assert.notEqual(next[0],first[0],'New level must replace stale upgrade buttons');assert.deepEqual(next.map(c=>c.dataset.upgrade),g.choices.map(c=>c.id));assert.match(a.get('overlay-content').innerHTML,new RegExp(`LV\\. ${g.level}`));const upgrades=g.metrics.upgrades;first[0].click();assert.equal(g.metrics.upgrades,upgrades,'Detached previous choice must not choose another level');});
test('death saves best exactly once, freezes time, and retry creates a clean run',()=>{const a=boot(),g=a.start();a.frames(12);a.die();assert.equal(a.get('overlay').hidden,false);assert.equal(a.saved.length,1);const oldTime=g.time;a.frames(20);assert.equal(g.time,oldTime);assert.equal(a.saved.length,1);a.key('KeyD');a.get('retry').click();const fresh=a.state().game;assert.notEqual(fresh,g);assert.equal(fresh.time,0);assert.equal(fresh.kills,0);assert.equal(fresh.player.hp,fresh.player.maxHp);assert.equal(a.state().keys.size,0);assert.equal(a.get('overlay').hidden,true);});
test('death home restores menu, saved best, and selected character',()=>{const a=boot();a.get('characters').children[2].click();a.start();a.frames(60);a.die();a.get('quit').click();assert.equal(a.state().game,null);assert.equal(a.state().screen,'menu');assert.equal(a.state().selected,'thorn');assert.equal(a.get('menu').hidden,false);for(const id of ['hud','pause','loadout','touch-controls','overlay'])assert.equal(a.get(id).hidden,true);assert.match(a.get('best').textContent,/00:01/);assert.equal(a.document.activeElement,a.get('start'));});
test('pause quit returns to menu without recording an unfinished run',()=>{const a=boot();a.start();a.frame();a.get('pause').click();a.get('quit').click();assert.equal(a.state().screen,'menu');assert.equal(a.saved.length,0);a.frame();});
test('victory persists one win only and supports retry and home',()=>{const a=boot('{"wins":2,"best":10}'),g=a.start();g.time=367;g._spawnBoss();g.boss.spawnTime=0;g._damageEnemy(g.boss,g.boss.hp);a.frame();assert.equal(g.state,'won');assert.equal(a.state().settings.wins,3);assert.equal(a.state().settings.best,367);a.frames(10);assert.equal(a.saved.length,1);assert.equal(a.state().settings.wins,3);a.get('quit').click();assert.equal(a.state().screen,'menu');assert.equal(a.get('best').textContent,'最長守夜 06:07');});
test('window blur pauses only active gameplay and clears both input sources',()=>{const a=boot(),g=a.start();a.key('KeyD');a.get('joystick').dispatch('pointerdown',{clientX:96,clientY:58});a.window.dispatch('blur');assert.equal(g.state,'paused');assert.equal(a.state().keys.size,0);assert.deepEqual(plain(a.state().axis),{x:0,y:0});a.window.dispatch('blur');assert.equal(g.state,'paused');a.get('resume').click();a.frames(3);assert.equal(g.player.x,1200);});
test('visibility auto-pause never auto-resumes or bypasses an upgrade',()=>{const a=boot(),g=a.start();a.document.hidden=true;a.document.dispatch('visibilitychange');assert.equal(g.state,'paused');a.document.hidden=false;a.document.dispatch('visibilitychange');assert.equal(g.state,'paused');a.get('resume').click();a.levelUp();a.document.hidden=true;a.document.dispatch('visibilitychange');assert.equal(g.state,'upgrade');});
for(const event of ['pointerup','pointercancel','lostpointercapture'])test(`joystick ${event} clears axis and permits a fresh pointer`,()=>{const a=boot(null,{coarse:true}),g=a.start(),stick=a.get('joystick');stick.dispatch('pointerdown',{pointerId:7,clientX:200,clientY:58});assert.equal(a.state().axis.x,1);a.frames(3);assert.ok(g.player.x>1200);stick.dispatch(event,{pointerId:7});assert.equal(a.state().pointer,null);assert.equal(a.state().axis.x,0);assert.equal(a.get('stick').style.transform,'none');const x=g.player.x;a.frames(3);assert.equal(g.player.x,x);stick.dispatch('pointerdown',{pointerId:8,clientX:20,clientY:58});assert.equal(a.state().axis.x,-1);});
test('joystick ignores unrelated pointer and scales analog movement',()=>{const a=boot(null,{coarse:true}),g=a.start(),stick=a.get('joystick');stick.dispatch('pointerdown',{pointerId:3,clientX:77,clientY:58});assert.equal(a.state().axis.x,.5);stick.dispatch('pointerdown',{pointerId:4,clientX:20,clientY:58});stick.dispatch('pointermove',{pointerId:4,clientX:20,clientY:58});stick.dispatch('pointerup',{pointerId:4});assert.equal(a.state().pointer,3);assert.equal(a.state().axis.x,.5);a.frames(6);assert.ok(Math.abs(g.player.x-1200-g.moveSpeed*.05)<1e-8);});
test('pause and retry release active joystick ownership before another touch',()=>{const a=boot(null,{coarse:true});a.start();const joystick=a.get('joystick');joystick.dispatch('pointerdown',{pointerId:9,clientX:96,clientY:58});a.get('pause').click();assert.equal(a.state().pointer,null);a.get('resume').click();joystick.dispatch('pointerdown',{pointerId:10,clientX:20,clientY:58});assert.equal(a.state().axis.x,-1);a.die();a.get('retry').click();joystick.dispatch('pointerdown',{pointerId:11,clientX:96,clientY:58});assert.equal(a.state().axis.x,1);});
test('mobile dash prevents default and triggers a real engine dash',()=>{const a=boot(null,{coarse:true}),g=a.start();const event=a.get('dash').dispatch('pointerdown');assert.equal(event.defaultPrevented,true);a.frame();assert.equal(g.metrics.dashes,1);});
test('HUD paints health, XP, kills, loadout ranks and boss damage',()=>{const a=boot(),g=a.start();g.player.hp=42;g.xp=6;g.kills=12;g.weapons.orbit=3;g.evolved.orbit=true;g._spawnBoss();g.boss.hp=g.boss.maxHp/2;a.evaluate('updateHUD()');assert.equal(a.get('health-fill').style.width,'42%');assert.equal(a.get('health-text').textContent,'♥ 42 / 100');assert.equal(a.get('xp-fill').style.width,'60%');assert.equal(a.get('kills').textContent,'12 擊破');assert.match(a.get('loadout').innerHTML,/evolved/);assert.equal(a.get('boss-bar').hidden,false);assert.equal(a.get('boss-fill').style.width,'50%');a.frame();});
test('renderer accepts actual enemy, projectile, drop, orbital and effect shapes',()=>{const a=boot(),g=a.start();for(const type of ['minion','charger','shooter','tank']){const e=g._spawnEnemy(type);e.x=g.player.x+80;e.y=g.player.y+40;e.spawnTime=0;}g._spawnBoss();g.boss.x=g.player.x-160;g.boss.y=g.player.y-80;g.weapons={fire:3,orbit:3,thunder:3,frost:3};for(const weapon of Object.keys(g.evolved))g.evolved[weapon]=true;g._enemyShot(1200,1100,1200,1200,185,12,6);g._dropXP(1280,1220,20);g.drops.push({type:'heal',x:1160,y:1230,radius:7,value:18});for(const type of ['warning','evolution','slash','dash','burst'])g._effect(type,1220,1250,50,1,'#ffffff');g._effect('lightning',1200,1200,0,1,'#fff',{points:[{x:1200,y:1200},{x:1300,y:1300}]});g._text(1200,1200,'42','#fff');a.frames(4);assert.ok(a.canvasCalls.get('drawImage')>20);assert.ok(a.canvasCalls.get('lineTo')>0);assert.ok(a.canvasCalls.get('fillText')>0);assert.ok(a.canvasCalls.get('rotate')>0);});
test('long frame gaps are clamped to 50ms and do not jump simulation',()=>{const a=boot(),g=a.start();a.frame(8);assert.ok(g.time<=.05+1e-10);a.frame(-1);assert.ok(g.time<=.05+1e-10);});

// Regressions for interrupted/keyboard-only navigation and corrupt numeric saves.
test('corrupt record values cannot produce negative or non-finite score text',()=>{for(const stored of ['{"best":-40,"wins":-2}','{"best":"Infinity","wins":"Infinity"}','{"best":{},"wins":[]}']){const a=boot(stored);assert.equal(a.state().settings.best,0);assert.equal(a.state().settings.wins,0);assert.equal(a.get('best').textContent,'最長守夜 00:00');}});
test('Space on menu and modal buttons keeps native keyboard activation available',()=>{const a=boot();assert.equal(a.key('Space').defaultPrevented,false);assert.equal(a.state().dash,false);const g=a.start();assert.equal(a.document.activeElement,a.get('world'));a.get('pause').click();assert.equal(a.document.activeElement,a.get('resume'));assert.equal(a.key('Space',{target:a.get('resume')}).defaultPrevented,false);assert.equal(a.state().dash,false);a.get('resume').click();assert.equal(a.document.activeElement,a.get('world'));a.frame();assert.equal(g.metrics.dashes,0);a.levelUp();assert.equal(a.key('Space').defaultPrevented,false);a.key('Digit1');a.die();assert.equal(a.key('Space',{target:a.get('retry')}).defaultPrevented,false);});
test('hidden joystick and dash controls cannot enqueue input outside gameplay',()=>{const a=boot(null,{coarse:true}),stick=a.get('joystick');stick.dispatch('pointerdown',{clientX:96,clientY:58});a.get('dash').dispatch('pointerdown');assert.equal(a.state().pointer,null);assert.equal(a.state().dash,false);a.start();a.get('pause').click();stick.dispatch('pointerdown',{clientX:96,clientY:58});a.get('dash').dispatch('pointerdown');assert.equal(a.state().pointer,null);assert.equal(a.state().dash,false);assert.equal(a.state().axis.x,0);});
test('clearing joystick input releases pointer capture and ignores subsequent stale movement',()=>{const a=boot(null,{coarse:true});a.start();const stick=a.get('joystick');stick.dispatch('pointerdown',{pointerId:42,clientX:96,clientY:58});assert.equal(stick.hasPointerCapture(42),true);a.get('pause').click();assert.equal(stick.hasPointerCapture(42),false);a.get('resume').click();stick.dispatch('pointermove',{pointerId:42,clientX:20,clientY:58});assert.equal(a.state().axis.x,0);});
test('upgrade cards show their exact weapon evolution condition',()=>{const a=boot();a.start();a.levelUp();for(const c of a.state().game.choices)if(c.requires)assert.ok(a.get('overlay-content').innerHTML.includes(c.requires));});
test('all queued XP choices can complete without stale overlays or invalid selections',()=>{const a=boot(),g=a.start();a.levelUp(100);let chosen=0;while(g.state==='upgrade'){assert.ok(chosen<20);const cards=a.get('overlay-content').querySelectorAll('[data-upgrade]');assert.deepEqual(cards.map(c=>c.dataset.upgrade),g.choices.map(c=>c.id));cards[0].click();chosen++;}assert.equal(g.metrics.upgrades,chosen);assert.equal(g.state,'playing');assert.equal(a.get('overlay').hidden,true);a.frame();});
