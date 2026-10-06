/* Lanternfall: original pixel artwork and deterministic Canvas2D world renderer. */
const TAU = Math.PI * 2;
const TILE = 48;
const PAL = {
  ember: { hood:'#713b39', cloth:'#ab5942', light:'#dd895b', trim:'#f8cb83', dark:'#392d36', glow:'#ffc06b' },
  tide: { hood:'#295166', cloth:'#397b88', light:'#65a5ad', trim:'#c1e4c4', dark:'#1e303f', glow:'#8be8e4' },
  thorn: { hood:'#44553e', cloth:'#72805a', light:'#a3ae73', trim:'#eadba1', dark:'#273533', glow:'#c2ea87' }
};
const SPRITES = new Map();
const MOTION = new WeakMap();
const hash = (x,y,s=0) => {let n=Math.imul(x+374761393+s*17,668265263)^Math.imul(y+1274126177,2246822519);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
const rect=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
function glow(c,x,y,r,color,alpha=.12){c.save();c.globalAlpha=alpha;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();}
function pixels(map,colors,key) {
  if (SPRITES.has(key)) return SPRITES.get(key);
  const w=Math.max(...map.map(r=>r.length)),h=map.length;
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h});
  const c=canvas.getContext('2d');
  for(let y=0;y<h;y++)for(let x=0;x<map[y].length;x++){const col=colors[map[y][x]];if(col){c.fillStyle=col;c.fillRect(x,y,1,1);}}
  SPRITES.set(key,canvas); return canvas;
}
function heroSprite(id='ember',frame=0) {
 const p=PAL[id]||PAL.ember;
 const map=[
 '        11111         ',
 '      112222211       ',
 '     12223332221      ',
 '    1223333333221     ',
 '    1233333333321     ',
 '   123322222333321    ',
 '   1222dddddd22221    ',
 '   122ddffffdd2221    ',
 '   12ddfefeefdd221    ',
 '    2ddffffffdd21    ',
 '    22ddffffdd221    ',
 '     122dddd2221      ',
 '    112233332211      ',
 '   1222ttttt22221     ',
 '   12322ttt223321  a  ',
 '   123322t2233321  a  ',
 '   12232222233221 aaa ',
 '    ff32222233ff1a a ',
 '    ff22222222ff aaaa',
 '     1222tt2221  abba',
 '     1232222321  abba',
 '    123332233321 aaaa',
 '    123331133321      ',
 '    12221 122221      ',
 frame?'     11    111        ':'     111   11         ',
 frame?'     ss     ss        ':'    ss     ss         ',
 frame?'    sss     sss       ':'    sss    sss        '
 ];
 return pixels(map,{'1':p.dark,'2':p.hood,'3':p.cloth,'t':p.trim,'d':'#332d36','f':'#e0b89b','e':'#423546','a':'#725642','b':p.glow,'s':'#182526'},`hero:${id}:${frame}`);
}
const ENEMY_MAPS={
 bat:[
 '       rr        ',
 '  v   rRRr   v   ',
 ' vv  rRrrRr  vv  ',
 'vvvv rRffRr vvvv ',
 'vVVvvRrrrRvvVVvv ',
 ' vVVVVRRRVVVVv   ',
 '  vvvVVRRVvvv    ',
 '    vvrrrvv      ',
 '      vvv        '
 ],
 slime:[
 '      GGGG       ',
 '    GGggggGG     ',
 '   GggllggggG    ',
 '  GglllggggggG   ',
 ' GggllggggggggG  ',
 ' GggggggggggggG  ',
 'GgggffggffgggggG ',
 'GgggffggffgggggG ',
 'GggggggggggggggG ',
 ' GggggGggGggggG  ',
 ' GGGgggGGgggGGG  ',
 '    GGGGGGGG     '
 ],
 charger:[
 '  hhh        hhh  ',
 '  hHhh      hhHh  ',
 '   hHhrrrrrrhHh   ',
 '   rrRrrrrrrRrr   ',
 '  rRrrrrrrrrrrRr  ',
 ' rRrrRrrrrrrRrrRr ',
 ' rRrffffrrffffrRr ',
 ' rRrrffrrrrffrrRr ',
 ' rRrrrrrrrrrrrrRr ',
 '  rRrrrHHHHrrrRr  ',
 '   rRrHffffHrRr   ',
 '    rRHffffHRr    ',
 '   rrrHHHHHHrrr   ',
 '   rRrrRrrRrrRr   ',
 '    rrRr  rRrr    ',
 '    hhh    hhh    '
 ],
 shooter:[
 '      dddd       ',
 '    ddMMMMdd     ',
 '   dMmmmmmmMd    ',
 '  dMmmmmmmmmMd   ',
 ' dMmmMMmmMMmmMd  ',
 ' dMmmMMmmMMmmMd  ',
 ' dMmmMMmmMMmmMd  ',
 '  dMmmmMMmmmMd   ',
 '   dMMMMMMMMd    ',
 '    ddmmmmdd     ',
 '   ddMmmmmMdd    ',
 '  dMMmMmmMmMMd   ',
 ' dMMmmMmmMmmMMd  ',
 ' dMmmmMmmMmmmMd  ',
 ' dMmmMMmmMMmmMd  ',
 ' ddMMMd  dMMMdd  ',
 '   ddd    ddd    '
 ],
 tank:[
 '     zzzzzzz     ',
 '    zSSSSSSSz    ',
 '   zSssllsssSz   ',
 '   zSslsslllSz   ',
 '   zSfffffffSz   ',
 '   zSfFfffFfSz   ',
 '    zfffffffz    ',
 ' zzzzSSSSSSSzzzz ',
 'zSSSSSsSsSsSSSSSz',
 'zSlssSsSsSsSSslSz',
 'zSlllSsSsSsSlllSz',
 'zSlllSsSsSsSlllSz',
 ' zSSSsSSSSSsSSSz ',
 '  zzzSSsssSSzzz  ',
 '    zSSsssSSz    ',
 '    zSSzzzSSz    ',
 '    zSSz zSSz    ',
 '    zSSz zSSz    ',
 '   zSSSz zSSSz   '
 ],
 boss:[
 '        b     b         ',
 '   b    bB   Bb    b    ',
 '   bB  bbB   Bbb  Bb    ',
 '    bBBBbbbbbBBBbb      ',
 '     bBBRRRRRBBb        ',
 '    bBRrrrrrrrRBb       ',
 '   bBRrrRRRrrrRRBb      ',
 '  bBRrrrRRRrrrrRRBb     ',
 '  bBRrrFFFFFrrrRRBb     ',
 '  bBRrFFfFfFFrrRRBb     ',
 '  bBRrFFfffFFrrRRBb     ',
 '   bBRrFFFFFrrRRBb      ',
 '    bBRRRRRRRRRBb       ',
 '  bbbbBBRRRRRBBbbbb     ',
 ' bBBRRRRRrRRRRRRRBBb    ',
 'bBRRRRRRrFrRRRRRRRRBb   ',
 'bBRRBBRrFFFrrBBRRRRBb   ',
 ' bBBBbRrFFFrrBbBBBb     ',
 '  bbbRrrrFrrrrBbbb      ',
 '    bRrrrrrrrrB         ',
 '   bRRrrrRrrrrRB        ',
 '   bRRrrRBRrrrRB        ',
 '  bRRrrRBbBRrrrRB       ',
 '  bRRRRBb bBRRRRB       ',
 ' bBBBBBb   bBBBBBb      '
 ]
};
const ENEMY_COLORS={
 bat:{v:'#332b4b',V:'#6e4c78',r:'#241f38',R:'#976584',f:'#facaa0'},
 slime:{G:'#203d3a',g:'#558178',l:'#85b5a0',f:'#d3efc2'},
 charger:{h:'#51454b',H:'#be9b80',r:'#452c36',R:'#96525a',f:'#f4b484'},
 shooter:{d:'#26334b',M:'#6685a1',m:'#3e536d'},
 tank:{z:'#25342f',S:'#59725c',s:'#849279',l:'#a3ae8c',f:'#273d32',F:'#ddc177'},
 boss:{b:'#322c35',B:'#68505b',R:'#6f363e',r:'#a75050',F:'#f8c880',f:'#713a36'}
};
function enemySprite(type){type=ENEMY_MAPS[type]?type:'slime';return pixels(ENEMY_MAPS[type],ENEMY_COLORS[type],`enemy:${type}`);}
function blit(c,sprite,x,y,scale=1,flip=false,alpha=1){c.save();c.translate(Math.round(x),Math.round(y));if(flip)c.scale(-1,1);c.globalAlpha=alpha;c.drawImage(sprite,Math.round(-sprite.width*scale/2),Math.round(-sprite.height*scale),sprite.width*scale,sprite.height*scale);c.restore();}
function ground(c,left,top,right,bottom,time,reducedMotion){
  const x0=Math.floor(left/TILE),y0=Math.floor(top/TILE),x1=Math.ceil(right/TILE),y1=Math.ceil(bottom/TILE);
  for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++){
    const x=gx*TILE,y=gy*TILE,h=hash(gx,gy),center=Math.hypot(x-1200,y-1200),courtyard=center<245;
    rect(c,x,y,TILE,TILE,courtyard?(h>.5?'#203535':'#213737'):(h>.6?'#182f2e':h>.28?'#192f2f':'#1b3230'));
    if(courtyard||h>.59){
      rect(c,x+2,y+2,TILE-3,TILE-3,courtyard?'#263e3c':'#223a36');
      rect(c,x+3,y+3,TILE-5,2,'#2c4540');
      rect(c,x+2,y+TILE-3,TILE-3,1,'#132c2b');
      if(h>.69){rect(c,x+15,y+4,1,8,'#1b302f');rect(c,x+16,y+12,8,1,'#1b302f');}
    }
    for(let j=0;j<5;j++){
      const n=hash(gx*13+j,gy*7+j,29),dx=3+Math.floor(n*39),dy=5+Math.floor(hash(gy+j,gx-j,4)*36);
      rect(c,x+dx,y+dy,2+(j%3),1,h>.6?'#385047':'#2a453c');
      if(j%2===0&&!courtyard){rect(c,x+dx+1,y+dy-2,1,3,'#345044');if(n>.8)rect(c,x+dx+3,y+dy-4,1,5,'#3b5748');}
    }
    if(h>.96&&!courtyard){rect(c,x+30,y+18,2,3,'#ad7e71');rect(c,x+28,y+16,6,2,'#cb9d89');}
  }
  // An old circular ward, partly lost beneath the moss.
  if(right>940&&left<1460&&bottom>940&&top<1460){
    c.strokeStyle='#3b5043';c.lineWidth=2;c.setLineDash([11,17]);c.beginPath();c.arc(1200,1200,161,0,TAU);c.stroke();c.setLineDash([]);
    c.strokeStyle='#324b42';c.lineWidth=1;c.beginPath();c.arc(1200,1200,170,0,TAU);c.stroke();
    for(let i=0;i<8;i++){let a=i*TAU/8;const x=1200+Math.cos(a)*165,y=1200+Math.sin(a)*165;rect(c,x-3,y-3,6,6,'#4d6150');rect(c,x-1,y-1,2,2,'#718067');}
    rect(c,1187,1187,26,26,'#28433d');rect(c,1191,1191,18,18,'#314d40');rect(c,1198,1184,4,32,'#435c48');rect(c,1184,1198,32,4,'#435c48');
  }
}
function drawTree(c,x,y,h){
 const s=.9+h*.35;
 c.save();c.translate(Math.round(x),Math.round(y));c.scale(s,s);
 ellipse(c,1,0,24,9,'#102825');
 rect(c,-5,-24,10,26,'#263833');rect(c,-3,-23,4,22,'#455043');rect(c,4,-23,2,21,'#1c302d');
 rect(c,-10,-2,5,3,'#3a493b');rect(c,3,-2,8,3,'#3a493b');
 rect(c,-4,-51,9,14,'#19332e');rect(c,-12,-41,25,15,'#1c3930');rect(c,-22,-27,44,14,'#153129');
 rect(c,-17,-37,34,12,'#1c392f');rect(c,-24,-19,49,8,'#153128');
 rect(c,-5,-48,7,6,'#325240');rect(c,-13,-36,17,4,'#294a39');rect(c,-20,-23,27,5,'#294b39');
 rect(c,5,-33,10,4,'#244535');rect(c,-9,-17,27,4,'#20432f');rect(c,16,-15,6,3,'#33503a');
 rect(c,-4,-9,16,3,'#112c24');c.restore();
}
function drawStone(c,x,y,h){
 ellipse(c,x,y+1,14,5,'#112b28');
 if(h>.72){
 rect(c,x-13,y-5,26,7,'#334a43');rect(c,x-11,y-28,22,24,'#465d51');rect(c,x-9,y-30,17,2,'#536958');rect(c,x-10,y-27,3,19,'#60715b');rect(c,x+8,y-27,3,23,'#2d443d');
 rect(c,x-2,y-24,3,13,'#293f39');rect(c,x-6,y-21,11,3,'#293f39');rect(c,x-9,y-5,12,2,'#66805a');
 }else{
 rect(c,x-13,y-6,26,6,'#2c443d');rect(c,x-10,y-11,19,6,'#4d6352');rect(c,x-7,y-14,13,4,'#61725b');rect(c,x+6,y-9,5,5,'#3a5144');rect(c,x-13,y-3,10,3,'#546943');
 }
}
function drawLamp(c,x,y,time,reducedMotion){
 const f=reducedMotion?1:1+Math.sin(time*5+x)*.025;
 glow(c,x,y-16,76*f,'#ffb856',.15);ellipse(c,x,y+2,16,5,'#142b27');
 rect(c,x-11,y-3,22,6,'#263a33');rect(c,x-7,y-9,14,8,'#435144');rect(c,x-3,y-31,6,23,'#6b6146');rect(c,x-4,y-31,2,21,'#8d7953');
 rect(c,x-10,y-37,20,5,'#443d34');rect(c,x-8,y-49,16,14,'#705c3b');rect(c,x-5,y-48,10,11,'#e6a454');rect(c,x-3,y-46,6,7,'#ffdb86');
 rect(c,x-10,y-52,20,4,'#4f4b37');rect(c,x-7,y-54,14,2,'#78704b');rect(c,x-2,y-57,4,4,'#9a8051');
 rect(c,x-8,y-48,2,11,'#403e32');rect(c,x+6,y-48,2,11,'#403e32');
 if(!reducedMotion){const n=(time*.45+x*.01)%1;rect(c,x-2+Math.sin(time+x)*6,y-57-n*14,2,2,'#c99351');}
}
function decorList(left,top,right,bottom){
 const list=[];
 for(let gy=Math.floor((top-70)/152);gy<=Math.ceil((bottom+80)/152);gy++)for(let gx=Math.floor((left-40)/152);gx<=Math.ceil((right+40)/152);gx++){
 const n=hash(gx,gy,135),x=gx*152+hash(gx,gy,16)*105,y=gy*152+hash(gy,gx,56)*110;
 if(Math.hypot(x-1200,y-1200)<202)continue;
 if(n<.31)list.push({type:'tree',x,y,n});else if(n<.57)list.push({type:'stone',x,y,n:hash(gx,gy,201)});
 }
 for(const [x,y]of [[1056,1056],[1344,1056],[1056,1344],[1344,1344]])if(x>left-90&&x<right+90&&y>top-90&&y<bottom+90)list.push({type:'lamp',x,y});
 return list;
}
function drawDrop(c,d,time,reducedMotion){
 const float=reducedMotion?0:Math.sin(time*3+d.x)*1.5;
 if(d.type==='heal'||d.type==='heart'||d.type==='health'){
 rect(c,d.x-4,d.y-5+float,8,8,'#653e43');rect(c,d.x-3,d.y-4+float,6,6,'#d97776');rect(c,d.x-1,d.y-6+float,2,10,'#edb59a');rect(c,d.x-4,d.y-3+float,8,3,'#edb59a');
 }else{
 const color=d.value>=10?'#e3bd70':d.value>=4?'#83c5b4':'#59a896';
 c.save();c.translate(Math.round(d.x),Math.round(d.y+float));c.rotate(Math.PI/4);rect(c,-3,-3,6,6,'#203e3c');rect(c,-2,-2,4,4,color);rect(c,-2,-2,2,2,'#d1e2bf');c.restore();
 }
}
function drawBullet(c,b,enemy=false){
 const x=b.x,y=b.y,color=b.color||(enemy?'#f1a08b':'#ffd494'),r=b.radius||3;
 if(b.type==='orb'||b.type==='bolt'||b.type==='fireball')glow(c,x,y,r*5,color,.28);
 const angle=Math.atan2(b.vy||0,b.vx||1);
 c.save();c.translate(Math.round(x),Math.round(y));c.rotate(angle);
 rect(c,-r*2,-Math.max(1,r*.4),r*2,Math.max(2,r*.8),enemy?'#864859':'#a7734b');
 rect(c,-r,-r,r*2,r*2,color);rect(c,-1,-1,2,2,'#fff1cf');c.restore();
}
function drawEffect(c,e,time,reducedMotion,front){
 const type=e.type||'',r=e.radius||e.r||20,life=e.life??.3,max=e.maxLife||e.duration||.5,alpha=Math.max(0,Math.min(1,life/max));
 const x=e.x||0,y=e.y||0,col=e.color||'#f7c57f';
 c.save();c.globalAlpha=alpha;
 if(type==='warning'){
  if(!front){const progress=1-alpha;ctxWarning(c,x,y,r,progress,col);}
 }else if(type==='ring'||type==='nova'||type==='pulse'||type==='explosion'||type==='blast'||type==='evolution'){
  if(front){c.strokeStyle=col;c.lineWidth=2;c.beginPath();c.arc(x,y,r*(.35+.65*(1-alpha)),0,TAU);c.stroke();glow(c,x,y,r,col,.18);}
 }else if(type==='slash'||type==='arc'){
  if(front){c.strokeStyle=col;c.lineWidth=4;c.beginPath();c.arc(x,y,r,(e.angle||0)-1,(e.angle||0)+1);c.stroke();c.lineWidth=1;c.beginPath();c.arc(x,y,r+4,(e.angle||0)-.8,(e.angle||0)+.8);c.stroke();}
 }else if(type==='dash'||type==='trail'){
  if(!front){ellipse(c,x,y,12,7,'#c1d8b3');}
 }else if(type==='lightning'||type==='beam'){
  if(front){c.strokeStyle=col;c.lineWidth=3;c.beginPath();c.moveTo(x,y);if(e.points?.length){for(const point of e.points)c.lineTo(point.x??point[0],point.y??point[1]);}else{const tx=e.tx??e.x2??x,ty=e.ty??e.y2??y;c.lineTo((x+tx)/2+8,(y+ty)/2);c.lineTo(tx,ty);}c.stroke();c.strokeStyle='#fff1c2';c.lineWidth=1;c.stroke();}
 }else if(front){
  const spread=(1-alpha)*12;for(let i=0;i<5;i++){const a=i*TAU/5+(e.seed||x);rect(c,x+Math.cos(a)*spread,y+Math.sin(a)*spread,2,2,col);}
 }
 c.restore();
}
function ctxWarning(c,x,y,r,progress,col){
 c.globalAlpha=.15+.2*progress;c.fillStyle=col||'#db6c57';c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
 c.globalAlpha=.65;c.strokeStyle=col||'#db6c57';c.lineWidth=2;c.setLineDash([5,5]);c.beginPath();c.arc(x,y,r,0,TAU);c.stroke();c.setLineDash([]);
 c.globalAlpha=.8;c.lineWidth=3;c.beginPath();c.arc(x,y,r,-Math.PI/2,-Math.PI/2+TAU*progress);c.stroke();
}
function drawEnemy(c,e,time,reducedMotion){
 const type=e.type==='minion'?((Number(e.id)||0)%5===0?'bat':'slime'):(e.type||'slime');const s=type==='boss'?2:type==='tank'?1.55:type==='charger'?1.4:type==='bat'?1.45:1.45;
 const r=e.radius||12;ellipse(c,e.x,e.y+3,r*.9,r*.32,'#0d2424');
 if(e.slow>0){c.strokeStyle='#76c8c6';c.globalAlpha=.6;c.lineWidth=1;c.beginPath();c.ellipse(e.x,e.y+3,r,r*.4,0,0,TAU);c.stroke();c.globalAlpha=1;}
 let bob=reducedMotion?0:type==='bat'?Math.sin(time*10+e.x)*3:Math.sin(time*6+e.x)*.6;
 if(type==='boss')glow(c,e.x,e.y-20,57,'#cf6d53',.15);
 const sprite=enemySprite(type);blit(c,sprite,e.x,e.y+5+bob,s,Boolean(e.vx<0));
 if(e.hitFlash>0||e.flash>0){c.save();c.globalAlpha=.55;rect(c,e.x-r*.7,e.y-r,r*1.4,r,'#ffe5bf');c.restore();}
 if(e.hp<e.maxHp&&type!=='boss'){
 const w=Math.max(18,r*2);rect(c,e.x-w/2,e.y-sprite.height*s-3,w,3,'#102826');rect(c,e.x-w/2,e.y-sprite.height*s-3,Math.max(0,w*e.hp/e.maxHp),2,'#cda477');
 }
}
function drawHero(c,p,game,time,reducedMotion){
 const id=p.character||p.characterId||game.character||'ember',pal=PAL[id]||PAL.ember;
 const prev=MOTION.get(p);const moving=Math.abs(p.vx||0)+Math.abs(p.vy||0)>.1||p.moving||(prev&&(Math.abs(prev.x-p.x)+Math.abs(prev.y-p.y)>.01));MOTION.set(p,{x:p.x,y:p.y});
 const frame=!reducedMotion&&moving&&Math.floor(time*9)%2?1:0;
 const bob=!reducedMotion&&moving?Math.sin(time*18)*.6:0;
 glow(c,p.x,p.y-10,86,pal.glow,.14);
 ellipse(c,p.x,p.y+4,13,5,'#0b2423');
 // Small ground ward makes the keeper visible in dense crowds.
 c.strokeStyle='#afc5a8';c.globalAlpha=.2;c.lineWidth=1;c.beginPath();c.ellipse(p.x,p.y+2,18,10,0,0,TAU);c.stroke();c.globalAlpha=1;
 const alpha=p.invuln>0&&Math.floor(time*18)%2===0?.55:1;
 const flip=p.facing===-1||p.facing==='left'||p.facing?.x<-.1||p.vx<-.1;
 blit(c,heroSprite(id,frame),p.x,p.y+5+bob,1.4,flip,alpha);
 glow(c,p.x+(flip?-12:12),p.y-7,24,pal.glow,.4);
 if(p.dashing||p.dashTime>0){c.strokeStyle=pal.trim;c.lineWidth=1;c.beginPath();c.arc(p.x,p.y-10,24,time*10,time*10+3);c.stroke();}
}

export function drawWorld(ctx,game,width,height,{reducedMotion=false,time}={}){
 if(!ctx||!width||!height)return;
 const g=game||{},p=g.player||{x:1200,y:1200,character:'ember'};
 const t=Number.isFinite(time)?time:Number.isFinite(g.time)?g.time:0;
 const scale=width<520?1.1:1.3;
 const left=p.x-width/scale/2,top=p.y-height/scale/2,right=p.x+width/scale/2,bottom=p.y+height/scale/2;
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,width,height);rect(ctx,0,0,width,height,'#172e2d');
 ctx.translate(Math.round(width/2),Math.round(height/2));ctx.scale(scale,scale);ctx.translate(-Math.round(p.x),-Math.round(p.y));
 ground(ctx,left-48,top-48,right+48,bottom+48,t,reducedMotion);
 const decor=decorList(left,top,right,bottom);
 // Light pools stay below the actors and never obscure attacks.
 for(const d of decor)if(d.type==='lamp')glow(ctx,d.x,d.y,88,'#d99647',.10);
 for(const d of (g.drops||[]))if(d.x>left-10&&d.x<right+10&&d.y>top-10&&d.y<bottom+10)drawDrop(ctx,d,t,reducedMotion);
 for(const e of (g.effects||[]))drawEffect(ctx,e,t,reducedMotion,false);
 for(const e of(g.enemies||[]))if(e.windup>0&&(e.type==='charger'||e.type==='shooter')){
  ctx.save();ctx.globalAlpha=.45;ctx.strokeStyle=e.type==='charger'?'#e49a74':'#adabd6';ctx.lineWidth=e.type==='charger'?2:1;ctx.setLineDash([4,7]);ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.aimX,e.aimY);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(e.x,e.y,e.radius+5,0,TAU);ctx.stroke();ctx.restore();
 }
 const actors=decor.map(d=>({kind:'decor',value:d,y:d.y}));
 for(const e of(g.enemies||[]))if(e.x>left-70&&e.x<right+70&&e.y>top-70&&e.y<bottom+70)actors.push({kind:'enemy',value:e,y:e.y});
 actors.push({kind:'hero',value:p,y:p.y});actors.sort((a,b)=>a.y-b.y);
 for(const actor of actors){
 const d=actor.value;
 if(actor.kind==='hero')drawHero(ctx,d,g,t,reducedMotion);
 else if(actor.kind==='enemy')drawEnemy(ctx,d,t,reducedMotion);
 else if(d.type==='tree'){ctx.save();if(Math.abs(p.x-d.x)<29&&p.y<d.y+6&&p.y>d.y-64)ctx.globalAlpha=.4;drawTree(ctx,d.x,d.y,d.n);ctx.restore();}
 else if(d.type==='stone')drawStone(ctx,d.x,d.y,d.n);
 else drawLamp(ctx,d.x,d.y,t,reducedMotion);
 }
 for(const orb of(g.orbitals||[])){
 const col=orb.color||'#d4dda0';glow(ctx,orb.x,orb.y,25,col,.2);ctx.save();ctx.translate(Math.round(orb.x),Math.round(orb.y));ctx.rotate(t*2);rect(ctx,-3,-8,6,16,'#547368');rect(ctx,-2,-7,4,14,col);rect(ctx,-5,-2,10,4,col);rect(ctx,-1,-3,2,6,'#fff1cf');ctx.restore();
 }
 for(const b of(g.bullets||[]))drawBullet(ctx,b);
 for(const b of(g.enemyBullets||[]))drawBullet(ctx,b,true);
 for(const e of(g.effects||[]))drawEffect(ctx,e,t,reducedMotion,true);
 const texts=g.texts||[];ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 11px ui-monospace, monospace';
 for(const n of texts){const a=Math.min(1,(n.life??1)*3);ctx.globalAlpha=a;ctx.lineWidth=3;ctx.strokeStyle='#162c2a';const txt=n.text??n.value??'';ctx.strokeText(txt,n.x,n.y);ctx.fillStyle=n.color||'#f5d29a';ctx.fillText(txt,n.x,n.y);}ctx.globalAlpha=1;
 // Fireflies are deterministic and restrained, with no flashing.
 for(let i=0;i<14;i++){
 const wx=Math.floor(p.x/320)*320+hash(i,12,5)*900-450,wy=Math.floor(p.y/320)*320+hash(i,17,8)*700-350;
 const dx=reducedMotion?0:Math.sin(t*.3+i)*9,dy=reducedMotion?0:Math.cos(t*.4+i)*7;
 ctx.globalAlpha=.18+(Math.sin((reducedMotion?0:t)*.8+i)+1)*.12;rect(ctx,wx+dx,wy+dy,2,2,'#bec49b');
 }ctx.globalAlpha=1;
 // Soft world boundary; the simulation clamps actors to its playable square.
 const size=g.worldSize||2400;ctx.strokeStyle='#557463';ctx.lineWidth=6;ctx.strokeRect(0,0,size,size);
 ctx.restore();
 ctx.save();const vignette=ctx.createRadialGradient(width/2,height/2,Math.min(width,height)*.15,width/2,height/2,Math.max(width,height)*.64);vignette.addColorStop(0,'transparent');vignette.addColorStop(.55,'rgba(5,18,22,.025)');vignette.addColorStop(1,'rgba(4,15,21,.54)');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);ctx.restore();
}

export function drawPortrait(canvas,characterId='ember'){
 if(!canvas)return;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const w=canvas.width||144,h=canvas.height||144,pal=PAL[characterId]||PAL.ember;
 ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=false;
 const bg=ctx.createRadialGradient(w*.5,h*.48,0,w*.5,h*.52,w*.65);bg.addColorStop(0,characterId==='ember'?'#574535':characterId==='tide'?'#25494b':'#3a4937');bg.addColorStop(1,'#182c2b');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 const unit=Math.max(2,Math.floor(Math.min(w,h)/42));
 for(let i=0;i<18;i++){const x=Math.floor(hash(i,3)*w/unit)*unit,y=Math.floor(hash(i,8)*h/unit)*unit;rect(ctx,x,y,unit,unit,i%4===0?pal.trim:'#52705a');}
 ctx.globalAlpha=.5;ctx.strokeStyle='#8f9f71';ctx.lineWidth=1;ctx.beginPath();ctx.arc(w/2,h*.5,w*.33,0,TAU);ctx.stroke();ctx.globalAlpha=1;
 const s=Math.min(w/31,h/32);ellipse(ctx,w/2,h*.89,w*.24,h*.045,'#112722');glow(ctx,w/2,h*.61,w*.4,pal.glow,.16);blit(ctx,heroSprite(characterId,0),w/2,h*.9,s,false);
 glow(ctx,w*.73,h*.65,w*.16,pal.glow,.2);
}
