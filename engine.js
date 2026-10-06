/** Lanternfall — deterministic, renderer-independent survivor simulation. */
export const CHARACTERS = [
  { id: 'ember', name: '燼火', title: '逐焰斥候', description: '以焰矢開局，所有武器傷害提高 15%。', color: '#ffad66', weapon: 'fire', bonus: '傷害 +15%' },
  { id: 'tide', name: '澄月', title: '守月旅人', description: '以霜環開局，所有武器冷卻縮短 15%。', color: '#79d9ef', weapon: 'frost', bonus: '冷卻 −15%' },
  { id: 'thorn', name: '棘森', title: '森境守衛', description: '以月刃開局，最大生命額外增加 25 點。', color: '#a8de83', weapon: 'orbit', bonus: '最大生命 +25' },
];

export const UPGRADES = {
  fire: { id: 'fire', name: '焰矢', description: '自動射向最近敵人。升階增加箭數與傷害。', kind: 'weapon', color: '#ffad66', maxLevel: 3, evolution: '鳳凰齊射', requires: '焰矢 III ＋ 力量 II' },
  orbit: { id: 'orbit', name: '月刃', description: '月刃環繞身邊，切開近處敵群。', kind: 'weapon', color: '#a8de83', maxLevel: 3, evolution: '森羅月輪', requires: '月刃 III ＋ 疾行 II' },
  thunder: { id: 'thunder', name: '雷印', description: '召來連鎖雷光。升階增加連鎖數與傷害。', kind: 'weapon', color: '#d4afff', maxLevel: 3, evolution: '星界雷暴', requires: '雷印 III ＋ 急速 II' },
  frost: { id: 'frost', name: '霜環', description: '月光脈衝傷害並減速周圍敵人。', kind: 'weapon', color: '#79d9ef', maxLevel: 3, evolution: '永冬之月', requires: '霜環 III ＋ 拾光 II' },
  atk: { id: 'atk', name: '力量', description: '所有武器傷害增加 20%。', kind: 'passive', color: '#ffad66', maxLevel: 3 },
  speed: { id: 'speed', name: '疾行', description: '移速增加 10%，衝刺冷卻縮短 0.4 秒。', kind: 'passive', color: '#a8de83', maxLevel: 3 },
  magnet: { id: 'magnet', name: '拾光', description: '拾取範圍增加 45，更輕鬆收集星光。', kind: 'passive', color: '#79d9ef', maxLevel: 3 },
  hp: { id: 'hp', name: '心木', description: '最大生命增加 25，立即恢復 35 生命。', kind: 'passive', color: '#f7a4bd', maxLevel: 3 },
  cooldown: { id: 'cooldown', name: '急速', description: '所有武器冷卻縮短 12%。', kind: 'passive', color: '#d4afff', maxLevel: 3 },
};

const EVOLUTIONS = { fire: 'atk', orbit: 'speed', thunder: 'cooldown', frost: 'magnet' };
const TAU = Math.PI * 2;
const FIXED_DT = 1 / 60;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const normalized = (x, y) => { const d = Math.hypot(x, y); return d ? { x: x / d, y: y / d } : { x: 0, y: 0 }; };
const segmentDistance2 = (px, py, x, y, qx, qy) => { const dx = x - px, dy = y - py; const t = clamp(((qx - px) * dx + (qy - py) * dy) / (dx * dx + dy * dy || 1), 0, 1); return (px + t * dx - qx) ** 2 + (py + t * dy - qy) ** 2; };

export class Game {
  constructor({ seed = 1, character = 'ember' } = {}) {
    this.seed = (Number(seed) >>> 0) || 1;
    this.character = CHARACTERS.find(c => c.id === character)?.id || 'ember';
    this.worldSize = 2400;
    this.caps = Object.freeze({ enemies: 150, bullets: 200, enemyBullets: 180, drops: 220, effects: 160, texts: 60 });
    this.reset();
  }
  reset({ seed = this.seed, character = this.character } = {}) {
    this.seed = (Number(seed) >>> 0) || 1;
    this.character = CHARACTERS.find(c => c.id === character)?.id || 'ember';
    this._rng = this.seed; this._bonusDamage = 0; this._id = 0; this._accumulator = 0; this._ticks = 0;
    this.state = 'playing'; this.time = 0; this.level = 1; this.xp = 0; this.xpNeeded = 10; this.kills = 0;
    this.player = { x: 1200, y: 1200, radius: 12, hp: this.character === 'thorn' ? 125 : 100, maxHp: this.character === 'thorn' ? 125 : 100, invuln: 1.2, facing: { x: 0, y: 1 }, dashTime: 0, moving: false };
    this.weapons = { fire: 0, orbit: 0, thunder: 0, frost: 0 };
    this.weapons[CHARACTERS.find(c => c.id === this.character).weapon] = 1;
    this.passives = { atk: 0, speed: 0, magnet: 0, hp: 0, cooldown: 0 };
    this.evolved = { fire: false, orbit: false, thunder: false, frost: false };
    this.enemies = []; this.bullets = []; this.enemyBullets = []; this.drops = []; this.effects = []; this.texts = []; this.events = []; this.orbitals = [];
    this.choices = []; this.boss = null; this.bossSpawned = false; this.dashCooldown = 0;
    this._spawnTimer = .55; this._weaponTimers = { fire: .1, frost: .25, thunder: .15 };
    this._dashHeld = false; this._dashQueued = false; this._dashDir = { x: 0, y: 1 }; this._bossAttack = null;
    this.metrics = { spawned: 0, damageDealt: 0, damageTaken: 0, xpCreated: 0, xpCollected: 0, upgrades: 0, dashes: 0, evolved: 0, peakEnemies: 0, peakBullets: 0, peakDrops: 0 };
    return this;
  }
  start(options) { return this.reset(options); }
  random() { let x = this._rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this._rng = x >>> 0; return this._rng / 4294967296; }
  get damageMultiplier() { return (this.character === 'ember' ? 1.15 : 1) * (1 + this.passives.atk * .2 + this._bonusDamage); }
  get cooldownMultiplier() { return (this.character === 'tide' ? .85 : 1) * (1 - this.passives.cooldown * .12); }
  get moveSpeed() { return 205 * (1 + this.passives.speed * .1); }
  get pickupRange() { return 75 + this.passives.magnet * 45; }
  get dashMaxCooldown() { return 4.2 - this.passives.speed * .4; }
  togglePause() { if (this.state === 'playing') this.state = 'paused'; else if (this.state === 'paused') this.state = 'playing'; this._accumulator = 0; return this.state; }
  pause() { return this.togglePause(); }
  step(dt, input = {}) {
    if (this.state !== 'playing') { this._dashHeld = !!input.dash; return; }
    if (input.dash && !this._dashHeld) this._dashQueued = true;
    this._dashHeld = !!input.dash;
    if (!Number.isFinite(dt) || dt <= 0) return;
    const x = Number.isFinite(input.x) ? input.x : 0, y = Number.isFinite(input.y) ? input.y : 0;
    const length = Math.hypot(x, y); const move = length > 1 ? { x: x / length, y: y / length } : { x, y };
    this._accumulator += Math.min(dt, .25);
    while (this._accumulator + 1e-10 >= FIXED_DT && this.state === 'playing') { this._accumulator -= FIXED_DT; this._tick(move); }
    if (this.state !== 'playing') this._accumulator = 0;
  }
  _tick(move) {
    const dt = FIXED_DT, p = this.player;
    this.time = ++this._ticks / 60;
    this.events = [];
    p.invuln = Math.max(0, p.invuln - dt); p.dashTime = Math.max(0, p.dashTime - dt); this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    p.moving = Math.hypot(move.x, move.y) > .02;
    if (p.moving) p.facing = normalized(move.x, move.y);
    if (this._dashQueued) {
      if (this.dashCooldown <= 0) { p.dashTime = .2; p.invuln = Math.max(p.invuln, .36); this.dashCooldown = this.dashMaxCooldown; this._dashDir = { ...p.facing }; this.metrics.dashes++; this._effect('dash', p.x, p.y, 24, .3, '#fff4d0'); this.events.push({ type: 'dash' }); }
      this._dashQueued = false;
    }
    const direction = p.dashTime > 0 ? this._dashDir : move;
    const speed = p.dashTime > 0 ? this.moveSpeed * 3.4 : this.moveSpeed;
    p.x = clamp(p.x + direction.x * speed * dt, 40, this.worldSize - 40); p.y = clamp(p.y + direction.y * speed * dt, 40, this.worldSize - 40);
    p.hp = Math.min(p.maxHp, p.hp + dt * .35);
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);
    for (const text of this.texts) { text.life -= dt; text.y -= 16 * dt; }
    this.texts = this.texts.filter(t => t.life > 0);
    if (!this.bossSpawned && this.time >= 360) this._spawnBoss();
    this._spawnTimer -= dt;
    while (this._spawnTimer <= 0) { this._spawnTimer += this.bossSpawned ? 1.1 : Math.max(.145, .74 - this.time / 590); this._spawnEnemy(); }
    this._moveEnemies(dt);
    this._fireWeapons(dt);
    this._moveBullets(dt);
    if (this.state !== 'playing') return;
    this._collectDrops(dt);
    if (this.xp >= this.xpNeeded) this._levelUp();
    this.metrics.peakEnemies = Math.max(this.metrics.peakEnemies, this.enemies.length);
    this.metrics.peakBullets = Math.max(this.metrics.peakBullets, this.bullets.length);
    this.metrics.peakDrops = Math.max(this.metrics.peakDrops, this.drops.length);
  }
  _spawnPoint(distance = 590) {
    const p = this.player;
    for (let i = 0; i < 16; i++) { const angle = this.random() * TAU; const q = { x: clamp(p.x + Math.cos(angle) * distance, 32, this.worldSize - 32), y: clamp(p.y + Math.sin(angle) * distance, 32, this.worldSize - 32) }; if (distance2(p, q) > 340 ** 2) return q; }
    return { x: p.x < 1200 ? p.x + 590 : p.x - 590, y: p.y };
  }
  _spawnEnemy(forceType) {
    if (this.enemies.length >= this.caps.enemies) return null;
    const roll = this.random();
    const type = forceType || (this.time > 140 && roll < .13 ? 'tank' : this.time > 85 && roll < .29 ? 'shooter' : this.time > 35 && roll < .49 ? 'charger' : 'minion');
    const definitions = { minion: { radius: 13, hp: 25, speed: 66, damage: 10, xp: 3 }, charger: { radius: 15, hp: 49, speed: 76, damage: 15, xp: 5 }, shooter: { radius: 15, hp: 48, speed: 52, damage: 12, xp: 6 }, tank: { radius: 24, hp: 145, speed: 43, damage: 20, xp: 10 } };
    const definition = definitions[type]; if (!definition) return null;
    const hp = Math.round(definition.hp * (1 + Math.min(this.time, 360) / 220));
    const enemy = { id: ++this._id, ...this._spawnPoint(), type, ...definition, hp, maxHp: hp, speed: definition.speed * (1 + Math.min(this.time, 360) / 1400), slow: 0, flash: 0, windup: 0, aimX: 0, aimY: 0, spawnTime: .5, attackCooldown: 1 + this.random() * 2.5, chargeTime: 0, hitCooldown: 0, phase: this.random() * TAU };
    this.enemies.push(enemy); this.metrics.spawned++; return enemy;
  }
  _spawnBoss() {
    this.bossSpawned = true;
    const pos = this._spawnPoint(430);
    const boss = { id: ++this._id, ...pos, type: 'boss', radius: 42, hp: 26000, maxHp: 26000, speed: 44, damage: 24, xp: 0, slow: 0, flash: 0, windup: 1.6, aimX: this.player.x, aimY: this.player.y, spawnTime: 1.6, attackCooldown: 2.5, chargeTime: 0, hitCooldown: 0, phase: 0 };
    if (this.enemies.length >= this.caps.enemies) { const old = this.enemies.find(e => e.type !== 'boss'); if (old) { this._dropXP(old.x, old.y, old.xp); this.enemies.splice(this.enemies.indexOf(old), 1); } }
    this.enemies.push(boss); this.boss = boss; this.metrics.spawned++;
    this._effect('warning', pos.x, pos.y, 85, 1.6, '#ff687d'); this._text(this.player.x, this.player.y - 65, '長夜之王降臨', '#ff9eac', 2.4); this.events.push({ type: 'boss' });
  }
  _moveEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.flash = Math.max(0, e.flash - dt); e.slow = Math.max(0, e.slow - dt); e.hitCooldown = Math.max(0, e.hitCooldown - dt); e.attackCooldown -= dt;
      if (e.spawnTime > 0) { e.spawnTime -= dt; continue; }
      let dir = normalized(p.x - e.x, p.y - e.y); let speed = e.speed * (e.slow > 0 ? .42 : 1);
      if (e.type === 'charger') {
        if (e.windup > 0) { e.windup -= dt; speed = 0; if (e.windup <= 0) e.chargeTime = .72; }
        else if (e.chargeTime > 0) { e.chargeTime -= dt; dir = normalized(e.aimX - e.x, e.aimY - e.y); speed = 290 * (e.slow > 0 ? .75 : 1); }
        else if (e.attackCooldown <= 0 && distance2(e, p) < 430 ** 2) { e.windup = .85; e.attackCooldown = 4; const aim = normalized(p.x - e.x, p.y - e.y); e.aimX = e.x + aim.x * 800; e.aimY = e.y + aim.y * 800; speed = 0; this._effect('warning', e.x, e.y, 26, .85, '#edbe73'); }
      } else if (e.type === 'shooter') {
        const distance = Math.sqrt(distance2(e, p));
        if (distance < 250) { dir.x *= -1; dir.y *= -1; } else if (distance < 365) { dir = { x: -dir.y * .38, y: dir.x * .38 }; }
        if (e.windup > 0) { e.windup -= dt; speed = 0; if (e.windup <= 0) this._enemyShot(e.x, e.y, e.aimX, e.aimY, 185, 12, 6); }
        else if (e.attackCooldown <= 0 && distance < 650) { e.windup = .8; e.attackCooldown = 3.1; e.aimX = p.x; e.aimY = p.y; speed = 0; }
      } else if (e.type === 'boss') {
        this._updateBoss(e, dt); if (e.windup > 0) speed *= .2;
      }
      e.x = clamp(e.x + dir.x * speed * dt, 25, this.worldSize - 25); e.y = clamp(e.y + dir.y * speed * dt, 25, this.worldSize - 25);
      if (distance2(e, p) < (e.radius + p.radius) ** 2) this._hurtPlayer(e.damage, e);
      if (this.state === 'dead') break;
    }
  }
  _updateBoss(boss, dt) {
    if (this._bossAttack) {
      this._bossAttack.timer -= dt; boss.windup = Math.max(0, this._bossAttack.timer);
      if (this._bossAttack.timer <= 0) {
        const attack = this._bossAttack; this._bossAttack = null;
        if (attack.type === 'rings') {
          const count = boss.hp < boss.maxHp * .5 ? 18 : 14;
          for (let i = 0; i < count; i++) { const angle = i * TAU / count + attack.angle; this._enemyShot(boss.x, boss.y, boss.x + Math.cos(angle) * 100, boss.y + Math.sin(angle) * 100, 155, 18, 7); }
          this._effect('burst', boss.x, boss.y, 85, .45, '#da8ddd');
        } else {
          for (const point of attack.points) { this._effect('burst', point.x, point.y, 83, .45, '#ff778a'); if (distance2(point, this.player) < (83 + this.player.radius) ** 2) this._hurtPlayer(24, point); }
        }
        boss.attackCooldown = boss.hp < boss.maxHp * .5 ? 1.8 : 2.7;
      }
    } else if (boss.attackCooldown <= 0) {
      boss.phase++;
      if (boss.phase % 2) { this._bossAttack = { type: 'rings', timer: 1.2, angle: this.random() * TAU }; boss.windup = 1.2; this._effect('warning', boss.x, boss.y, 75, 1.2, '#d4afff'); }
      else { const points = [{ x: this.player.x, y: this.player.y }]; for (let i = 0; i < 3; i++) { const angle = this.random() * TAU; points.push({ x: this.player.x + Math.cos(angle) * 155, y: this.player.y + Math.sin(angle) * 155 }); } this._bossAttack = { type: 'meteors', timer: 1.35, points }; boss.windup = 1.35; for (const point of points) this._effect('warning', point.x, point.y, 83, 1.35, '#ff778a'); }
    }
  }
  _nearest(point = this.player, range = 690, excluded = null) {
    let closest = null, best = range * range;
    for (const enemy of this.enemies) { if (enemy.hp <= 0 || (excluded && excluded.has(enemy.id))) continue; const d = distance2(point, enemy); if (d < best) { best = d; closest = enemy; } }
    return closest;
  }
  _fireWeapons(dt) {
    const p = this.player, damage = this.damageMultiplier;
    for (const key of ['fire', 'thunder', 'frost']) this._weaponTimers[key] -= dt;
    const fire = this.weapons.fire;
    if (fire && this._weaponTimers.fire <= 0) {
      const target = this._nearest();
      if (target) {
        this._weaponTimers.fire = (.66 - fire * .055) * this.cooldownMultiplier;
        const count = fire + (this.evolved.fire ? 1 : 0), baseAngle = Math.atan2(target.y - p.y, target.x - p.x);
        for (let i = 0; i < count; i++) { if (this.bullets.length >= this.caps.bullets) break; const angle = baseAngle + (i - (count - 1) / 2) * .1; const speed = this.evolved.fire ? 500 : 430; this.bullets.push({ id: ++this._id, x: p.x, y: p.y, px: p.x, py: p.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: this.evolved.fire ? 7 : 5, color: this.evolved.fire ? '#fff0a7' : '#ffad66', kind: 'fire', life: 1.65, damage: (25 + fire * 5) * damage * (this.evolved.fire ? 1.3 : 1), pierce: this.evolved.fire ? 3 : (fire === 3 ? 1 : 0), hit: new Set() }); }
      }
    }
    const orbit = this.weapons.orbit; this.orbitals = [];
    if (orbit) {
      const count = orbit + 1 + (this.evolved.orbit ? 2 : 0), range = this.evolved.orbit ? 100 : 72 + orbit * 6;
      for (let i = 0; i < count; i++) { const angle = this.time * (this.evolved.orbit ? 3.5 : 2.55) + i * TAU / count; const blade = { x: p.x + Math.cos(angle) * range, y: p.y + Math.sin(angle) * range, radius: this.evolved.orbit ? 15 : 12, color: this.evolved.orbit ? '#e4ffd0' : '#a8de83' }; this.orbitals.push(blade);
        for (const e of this.enemies) { if (e.hp > 0 && e.hitCooldown <= 0 && distance2(e, blade) < (blade.radius + e.radius) ** 2) { e.hitCooldown = .24; this._damageEnemy(e, (18 + orbit * 9) * damage * (this.evolved.orbit ? 1.35 : 1)); } }
      }
    }
    const thunder = this.weapons.thunder;
    if (thunder && this._weaponTimers.thunder <= 0) {
      let target = this._nearest(p, 590);
      if (target) {
        this._weaponTimers.thunder = (2.4 - thunder * .15) * this.cooldownMultiplier;
        const points = [{ x: p.x, y: p.y }], hit = new Set(), count = 2 + thunder + (this.evolved.thunder ? 5 : 0);
        for (let i = 0; i < count && target; i++) { hit.add(target.id); points.push({ x: target.x, y: target.y }); this._damageEnemy(target, (34 + thunder * 12) * damage * (this.evolved.thunder ? 1.45 : 1)); if (this.evolved.thunder) for (const e of this.enemies) if (e.hp > 0 && e.id !== target.id && distance2(e, target) < 65 ** 2) this._damageEnemy(e, 22 * damage); target = this._nearest(target, this.evolved.thunder ? 280 : 200, hit); }
        this._effect('lightning', p.x, p.y, 0, .24, '#d4afff', { points });
      }
    }
    const frost = this.weapons.frost;
    if (frost && this._weaponTimers.frost <= 0) {
      const radius = 125 + frost * 25 + (this.evolved.frost ? 60 : 0);
      if (this._nearest(p, radius + 25)) {
        this._weaponTimers.frost = (2.25 - frost * .12) * this.cooldownMultiplier;
        this._effect('pulse', p.x, p.y, radius, .55, '#79d9ef');
        for (const e of this.enemies) if (e.hp > 0 && distance2(e, p) < (radius + e.radius) ** 2) { e.slow = this.evolved.frost ? 3 : 2; this._damageEnemy(e, (30 + frost * 13) * damage * (this.evolved.frost ? 1.45 : 1)); }
        if (this.evolved.frost) this.enemyBullets = this.enemyBullets.filter(b => distance2(b, p) > radius ** 2);
      }
    }
  }
  _enemyShot(x, y, tx, ty, speed, damage, radius) {
    if (this.enemyBullets.length >= this.caps.enemyBullets) return;
    const dir = normalized(tx - x, ty - y);
    this.enemyBullets.push({ id: ++this._id, x, y, px: x, py: y, vx: dir.x * speed, vy: dir.y * speed, radius, color: '#f484a4', kind: 'enemy', life: 6, damage });
  }
  _moveBullets(dt) {
    for (const b of this.bullets) {
      b.px = b.x; b.py = b.y; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      for (const e of this.enemies) { if (e.hp <= 0 || b.life <= 0 || b.hit.has(e.id)) continue; if (segmentDistance2(b.px, b.py, b.x, b.y, e.x, e.y) < (b.radius + e.radius) ** 2) { b.hit.add(e.id); this._damageEnemy(e, b.damage); if (--b.pierce < 0) b.life = 0; } }
    }
    this.bullets = this.bullets.filter(b => b.life > 0 && b.x > 0 && b.x < this.worldSize && b.y > 0 && b.y < this.worldSize);
    for (const b of this.enemyBullets) { b.px = b.x; b.py = b.y; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (segmentDistance2(b.px, b.py, b.x, b.y, this.player.x, this.player.y) < (b.radius + this.player.radius) ** 2) { this._hurtPlayer(b.damage, b); b.life = 0; } }
    this.enemyBullets = this.enemyBullets.filter(b => b.life > 0 && b.x > 0 && b.x < this.worldSize && b.y > 0 && b.y < this.worldSize);
    this.enemies = this.enemies.filter(e => e.hp > 0);
  }
  _damageEnemy(enemy, amount) {
    if (enemy.hp <= 0 || this.state !== 'playing' || (enemy.type === 'boss' && enemy.spawnTime > 0)) return;
    this.metrics.damageDealt += Math.min(enemy.hp, amount); enemy.hp = Math.max(0, enemy.hp - amount); enemy.flash = .09;
    if (enemy.hp > 0) return;
    this.kills++; this._effect('burst', enemy.x, enemy.y, enemy.radius + 8, .24, enemy.type === 'boss' ? '#fbd698' : '#bac989');
    if (enemy.type === 'boss') { this.state = 'won'; this._bossAttack = null; this.enemyBullets = []; this.events.push({ type: 'victory' }); this._text(this.player.x, this.player.y - 45, '黎明歸來', '#fff0b8', 10); return; }
    this._dropXP(enemy.x, enemy.y, enemy.xp);
    if (this.random() < .027 && this.drops.length < this.caps.drops) this.drops.push({ id: ++this._id, x: enemy.x, y: enemy.y, radius: 7, value: 18, type: 'heal' });
  }
  _hurtPlayer(amount, source) {
    const p = this.player;
    if (p.invuln > 0 || this.state !== 'playing') return false;
    p.hp = Math.max(0, p.hp - amount); p.invuln = 1; this.metrics.damageTaken += amount;
    this._effect('burst', p.x, p.y, 26, .24, '#f77789'); this._text(p.x, p.y - 22, `−${amount}`, '#ff9fa9'); this.events.push({ type: 'hurt', amount });
    if (source) { const dir = normalized(p.x - source.x, p.y - source.y); p.x = clamp(p.x + dir.x * 18, 40, this.worldSize - 40); p.y = clamp(p.y + dir.y * 18, 40, this.worldSize - 40); }
    if (p.hp <= 0) { this.state = 'dead'; this.events.push({ type: 'death' }); }
    return true;
  }
  _dropXP(x, y, amount) {
    if (!(amount > 0)) return;
    this.metrics.xpCreated += amount;
    const xpDrops = this.drops.filter(d => d.type === 'xp');
    let closest = null, best = Infinity;
    for (const drop of xpDrops) { const d = (drop.x - x) ** 2 + (drop.y - y) ** 2; if (d < best) { best = d; closest = drop; } }
    if (closest && (best < 26 ** 2 || this.drops.length >= this.caps.drops)) {
      const sum = closest.value + amount; closest.x = (closest.x * closest.value + x * amount) / sum; closest.y = (closest.y * closest.value + y * amount) / sum; closest.value = sum; closest.radius = Math.min(11, 5 + Math.log2(sum + 1) * .5);
    } else if (this.drops.length < this.caps.drops) this.drops.push({ id: ++this._id, x, y, radius: 5, value: amount, type: 'xp' });
    else { // A cap filled entirely by healing drops still must not destroy experience.
      const index = this.drops.findIndex(d => d.type === 'heal'); this.drops[index] = { id: ++this._id, x, y, radius: 5, value: amount, type: 'xp' };
    }
  }
  _collectDrops(dt) {
    const p = this.player, range2 = this.pickupRange ** 2;
    this.drops = this.drops.filter(drop => {
      const d2 = distance2(drop, p);
      if (d2 < range2 || drop.attracted) { drop.attracted = true; const dir = normalized(p.x - drop.x, p.y - drop.y); const amount = Math.min(Math.sqrt(d2), (330 + this.pickupRange * 1.4) * dt); drop.x += dir.x * amount; drop.y += dir.y * amount; }
      if (distance2(drop, p) < (p.radius + drop.radius + 4) ** 2) { if (drop.type === 'heal') { p.hp = Math.min(p.maxHp, p.hp + drop.value); this._text(p.x, p.y - 25, `+${drop.value}`, '#9ee69f'); } else { this.xp += drop.value; this.metrics.xpCollected += drop.value; } return false; }
      return true;
    });
  }
  _levelUp() {
    this.xp -= this.xpNeeded; this.level++; this.xpNeeded = 10 + (this.level - 1) * 9;
    this.state = 'upgrade'; this._dashQueued = false;
    this._makeChoices(); this.events.push({ type: 'levelup', level: this.level });
  }
  _makeChoices() {
    const pool = Object.values(UPGRADES).filter(item => (item.kind === 'weapon' ? this.weapons[item.id] : this.passives[item.id]) < item.maxLevel);
    const chosen = [];
    // Guarantee a weapon choice while the player has a small arsenal.
    const weaponPool = pool.filter(item => item.kind === 'weapon');
    if (weaponPool.length) { const item = weaponPool[Math.floor(this.random() * weaponPool.length)]; chosen.push(item); pool.splice(pool.indexOf(item), 1); }
    while (chosen.length < 3 && pool.length) chosen.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]);
    const extras = [
      { id: 'mend', name: '回春', description: '立即恢復 45 點生命。', kind: 'boon', color: '#f7a4bd', maxLevel: Infinity },
      { id: 'power', name: '繁茂', description: '本局所有武器傷害額外增加 5%。', kind: 'boon', color: '#ffad66', maxLevel: Infinity },
      { id: 'renew', name: '深根', description: '最大生命增加 10，立即恢復 10 生命。', kind: 'boon', color: '#a8de83', maxLevel: Infinity },
    ];
    for (const extra of extras) if (chosen.length < 3) chosen.push(extra);
    this.choices = chosen.map(item => { const level = item.kind === 'weapon' ? this.weapons[item.id] : (this.passives[item.id] || 0); return { ...item, level, nextLevel: level + 1 }; });
  }
  chooseUpgrade(id) {
    if (this.state !== 'upgrade' || !this.choices.some(choice => choice.id === id)) return false;
    const item = this.choices.find(choice => choice.id === id);
    if (item.kind === 'weapon') this.weapons[id]++;
    else if (item.kind === 'passive') this.passives[id]++;
    if (id === 'hp') { this.player.maxHp += 25; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 35); }
    if (id === 'mend') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 45);
    if (id === 'renew') { this.player.maxHp += 10; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 10); }
    if (id === 'power') this._bonusDamage += .05;
    this.metrics.upgrades++; this.choices = []; this.state = 'playing'; this.player.invuln = Math.max(this.player.invuln, .8);
    for (const [weapon, passive] of Object.entries(EVOLUTIONS)) if (!this.evolved[weapon] && this.weapons[weapon] >= 3 && this.passives[passive] >= 2) { this.evolved[weapon] = true; this.metrics.evolved++; this._effect('evolution', this.player.x, this.player.y, 180, 1.5, UPGRADES[weapon].color); this._text(this.player.x, this.player.y - 55, UPGRADES[weapon].evolution.toUpperCase(), UPGRADES[weapon].color, 2.2); this.events.push({ type: 'evolution', weapon, name: UPGRADES[weapon].evolution }); }
    if (this.xp >= this.xpNeeded) this._levelUp();
    return true;
  }
  _effect(type, x, y, radius, life, color, extra = {}) { if (this.effects.length >= this.caps.effects) this.effects.shift(); this.effects.push({ type, x, y, radius, life, maxLife: life, color, ...extra }); }
  _text(x, y, text, color, life = .8) { if (this.texts.length >= this.caps.texts) this.texts.shift(); this.texts.push({ x, y, text, color, life, maxLife: life }); }
}
