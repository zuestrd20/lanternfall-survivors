import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game, CHARACTERS, UPGRADES } from './engine.js';

const advance = (game, seconds, input = {}) => { for (let i = 0; i < seconds * 60; i++) game.step(1 / 60, input); };
const snapshot = game => JSON.stringify({ rng: game._rng, player: game.player, time: game.time, enemies: game.enemies, drops: game.drops, bullets: game.bullets, metrics: game.metrics, state: game.state });

test('all archetypes have distinct, usable starting loadouts', () => {
  assert.equal(CHARACTERS.length, 3);
  for (const character of CHARACTERS) { const game = new Game({ character: character.id }); assert.equal(game.weapons[character.weapon], 1); assert.equal(game.player.hp, game.player.maxHp); assert.equal(game.state, 'playing'); }
  assert.equal(new Game({ character: 'thorn' }).player.maxHp, 125);
  assert.equal(new Game({ character: 'ember' }).damageMultiplier, 1.15);
  assert.equal(new Game({ character: 'tide' }).cooldownMultiplier, .85);
});
test('same seed and inputs are deterministic across rendering frame rates', () => {
  const a = new Game({ seed: 745 }), b = new Game({ seed: 745 });
  for (let i = 0; i < 60 * 30; i++) a.step(1 / 60, { x: .3, y: -.25 });
  for (let i = 0; i < 30 * 30; i++) b.step(1 / 30, { x: .3, y: -.25 });
  assert.equal(snapshot(a), snapshot(b));
});
test('movement normalizes diagonals, clamps edges, and rejects nonfinite input', () => {
  const a = new Game(), b = new Game(); advance(a, 1, { x: 1 }); advance(b, 1, { x: 1, y: 1 });
  assert.ok(Math.abs(Math.hypot(a.player.x - 1200, a.player.y - 1200) - Math.hypot(b.player.x - 1200, b.player.y - 1200)) < .000001);
  advance(a, 10, { x: 1 }); assert.equal(a.player.x, 2360);
  a.step(NaN, { x: Infinity }); a.step(1 / 60, { x: NaN, y: Infinity }); assert.ok(Number.isFinite(a.player.x));
});
test('pause freezes every simulation field and resumes cleanly', () => {
  const game = new Game(); advance(game, 3); game.togglePause(); const before = snapshot(game); advance(game, 12, { x: 1, dash: true }); assert.equal(snapshot(game), before); assert.equal(game.togglePause(), 'playing'); game.step(1 / 60, { x: 1 }); assert.ok(game.time > 3);
});
test('upgrade choices are unique, valid, freeze combat, and reject stale or invalid clicks', () => {
  const game = new Game(); game.xp = 10; game.step(1 / 60, {}); assert.equal(game.state, 'upgrade');
  assert.equal(game.choices.length, 3); assert.equal(new Set(game.choices.map(x => x.id)).size, 3);
  const before = snapshot(game); advance(game, 5, { x: 1 }); assert.equal(snapshot(game), before);
  assert.equal(game.chooseUpgrade('not-a-choice'), false); assert.equal(game.state, 'upgrade');
  const chosen = game.choices[0].id; assert.equal(game.chooseUpgrade(chosen), true); assert.equal(game.state, 'playing'); assert.equal(game.chooseUpgrade(chosen), false); assert.equal(game.metrics.upgrades, 1);
});
test('large XP awards carry overflow through multiple level-ups without loss', () => {
  const game = new Game(); game.xp = 70; game.step(1 / 60); let spent = 10;
  assert.equal(game.level, 2); assert.equal(game.xp, 60);
  game.chooseUpgrade(game.choices[0].id); spent += 19; assert.equal(game.level, 3); assert.equal(game.state, 'upgrade');
  game.chooseUpgrade(game.choices[0].id); spent += 28; assert.equal(game.level, 4); assert.equal(game.xp, 70 - spent);
  game.chooseUpgrade(game.choices[0].id); assert.equal(game.state, 'playing');
});
test('each evolution needs weapon III and its matching passive II and activates once', () => {
  for (const [weapon, passive] of Object.entries({ fire: 'atk', orbit: 'speed', thunder: 'cooldown', frost: 'magnet' })) {
    const game = new Game(); game.weapons[weapon] = 3; game.passives[passive] = 1; game.state = 'upgrade'; game.choices = [{ ...UPGRADES[passive], level: 1, nextLevel: 2 }];
    assert.equal(game.evolved[weapon], false); game.chooseUpgrade(passive); assert.equal(game.evolved[weapon], true); assert.equal(game.metrics.evolved, 1);
    game.state = 'upgrade'; game.choices = [{ ...UPGRADES.hp }]; game.chooseUpgrade('hp'); assert.equal(game.metrics.evolved, 1);
  }
});
test('dash has invulnerability, cooldown, and rising-edge activation', () => {
  const game = new Game(); game.player.invuln = 0; game.step(1 / 60, { x: 1, dash: true });
  assert.equal(game.metrics.dashes, 1); assert.ok(game.player.invuln > 0); assert.ok(game.dashCooldown > 4);
  assert.equal(game._hurtPlayer(100), false); advance(game, 5, { dash: true }); assert.equal(game.metrics.dashes, 1);
  game.step(1 / 60, { dash: false }); game.step(1 / 60, { dash: true }); assert.equal(game.metrics.dashes, 2);
});
test('contact damage cannot chain hit through iFrames and zero HP ends the run', () => {
  const game = new Game(); game.player.invuln = 0; assert.equal(game._hurtPlayer(40), true); assert.equal(game._hurtPlayer(40), false); assert.equal(game.player.hp, 60);
  game.player.invuln = 0; game._hurtPlayer(99); assert.equal(game.state, 'dead'); assert.equal(game.player.hp, 0); const before = snapshot(game); advance(game, 10); assert.equal(snapshot(game), before);
});
test('drop caps merge XP amounts without losing generated experience', () => {
  const game = new Game(); for (let i = 0; i < 2000; i++) game._dropXP((i * 47) % 2400, (i * 127) % 2400, 3 + i % 7);
  assert.ok(game.drops.length <= game.caps.drops); assert.equal(game.drops.reduce((sum, drop) => sum + drop.value, 0), game.metrics.xpCreated);
  game.drops.forEach(drop => { drop.x = game.player.x; drop.y = game.player.y; }); game._collectDrops(1 / 60); assert.equal(game.metrics.xpCollected, game.metrics.xpCreated); assert.equal(game.xp, game.metrics.xpCreated);
});
test('an all-healing capped drop field still preserves newly generated XP', () => {
  const game = new Game(); game.drops = Array.from({ length: game.caps.drops }, (_, id) => ({ id, type: 'heal', x: 50, y: 50, radius: 7, value: 18 })); game._dropXP(80, 80, 10); assert.equal(game.drops.length, game.caps.drops); assert.equal(game.drops.filter(d => d.type === 'xp').reduce((n, d) => n + d.value, 0), 10);
});
test('entity caps hold under high spawning/projectile pressure', () => {
  const game = new Game(); for (let i = 0; i < 500; i++) { game._spawnEnemy(); game._enemyShot(100, 100, 300, 300, 100, 2, 3); }
  assert.equal(game.enemies.length, game.caps.enemies); assert.equal(game.enemyBullets.length, game.caps.enemyBullets);
  game._spawnBoss(); assert.equal(game.enemies.length, game.caps.enemies); assert.ok(game.enemies.includes(game.boss));
});
test('fast projectiles use swept collision rather than tunneling', () => {
  const game = new Game(); const e = game._spawnEnemy(); e.x = 1210; e.y = 1200; e.hp = 10;
  game.bullets.push({ x: 1180, y: 1200, vx: 5000, vy: 0, radius: 5, life: 1, damage: 50, pierce: 0, hit: new Set() }); game._moveBullets(1 / 60); assert.equal(e.hp <= 0, true); assert.equal(game.kills, 1);
});
test('the six-minute mark starts the boss, and victory requires its defeat', () => {
  const game = new Game(); game._ticks = 21599; game.step(1 / 60); assert.equal(game.time, 360); assert.equal(game.bossSpawned, true); assert.equal(game.state, 'playing'); assert.equal(game.boss.type, 'boss'); assert.ok(game.effects.some(e => e.type === 'warning'));
  game._damageEnemy(game.boss, game.boss.hp); assert.equal(game.state, 'playing'); game.boss.spawnTime = 0; game._damageEnemy(game.boss, game.boss.hp - 1); assert.equal(game.state, 'playing'); game._damageEnemy(game.boss, 1); assert.equal(game.state, 'won'); const before = snapshot(game); advance(game, 5); assert.equal(snapshot(game), before);
});
test('boss meteor warnings freeze their target and precede damage', () => {
  const game = new Game(); game._spawnBoss(); const boss = game.boss; boss.spawnTime = 0; boss.phase = 1; boss.attackCooldown = 0; game._updateBoss(boss, 1 / 60); assert.equal(game._bossAttack.type, 'meteors'); const lockedX = game._bossAttack.points[0].x;
  game.player.x += 400; game._updateBoss(boss, .7); assert.equal(game._bossAttack.points[0].x, lockedX); assert.equal(game.player.hp, game.player.maxHp); game._updateBoss(boss, .7); assert.equal(game._bossAttack, null);
});
test('restart removes every run-specific entity, upgrade, timer, and metric', () => {
  const game = new Game({ seed: 8, character: 'tide' }); advance(game, 20, { x: .2 }); game.weapons.fire = 3; game.evolved.fire = true; game.state = 'dead'; game.start();
  assert.equal(snapshot(game), snapshot(new Game({ seed: 8, character: 'tide' }))); assert.equal(game.weapons.fire, 0); assert.equal(game.evolved.fire, false); assert.equal(game.boss, null); assert.equal(game.level, 1);
});

/** Uses only documented player actions; no god mode, stat writes or simulated kills. */
export function runPilot(character = 'ember', seed = 12, maxSeconds = 510) {
  const game = new Game({ seed, character }); let frames = 0; let direction = { x: 1, y: 0 }; let dashLast = false;
  const priority = choice => {
    const id = choice.id;
    if (id === 'hp' && game.player.hp < game.player.maxHp * .55) return 140;
    if (id === 'mend') return game.player.hp < game.player.maxHp * .65 ? 150 : 0;
    if (id === 'orbit') return 108 + choice.level * 3;
    if (id === 'frost') return 102 + choice.level;
    if (id === 'fire') return 98 + choice.level * 2;
    if (id === 'thunder') return 92 + choice.level;
    if (id === 'magnet') return game.passives.magnet < 2 ? 110 : 45;
    if (id === 'speed') return game.passives.speed < 2 ? 107 : 60;
    if (id === 'atk') return 95;
    if (id === 'cooldown') return 91;
    if (id === 'hp') return 55;
    return 40;
  };
  while (!['dead', 'won'].includes(game.state) && game.time < maxSeconds && frames < maxSeconds * 65) {
    if (game.state === 'upgrade') { game.chooseUpgrade([...game.choices].sort((a, b) => priority(b) - priority(a))[0].id); continue; }
    const p = game.player;
    if (frames % 6 === 0) {
      let target = null, score = Infinity;
      for (const drop of game.drops) { const d = Math.hypot(drop.x - p.x, drop.y - p.y); const s = d / Math.pow(Math.min(30, drop.value), .4); if (s < score && !(drop.type === 'heal' && p.hp > p.maxHp - 15)) { score = s; target = drop; } }
      if (game.boss && game.boss.hp > 0) target = game.boss;
      if (!target) target = { x: 1200 + Math.cos(game.time * .05) * 400, y: 1200 + Math.sin(game.time * .05) * 400 };
      let dx = target.x - p.x, dy = target.y - p.y, length = Math.hypot(dx, dy) || 1;
      dx /= length; dy /= length;
      if (target === game.boss && length < 160) { const old = dx; dx = -dy; dy = old; }
      for (const enemy of game.enemies) { const ex = p.x - enemy.x, ey = p.y - enemy.y, d = Math.hypot(ex, ey) || 1; const safe = enemy.type === 'boss' ? 115 : enemy.type === 'tank' ? 85 : 75;
        if (d < safe) { const strength = (1 - d / safe) * 4; dx += ex / d * strength; dy += ey / d * strength; }
      }
      for (const b of game.enemyBullets) { const bx = p.x - b.x, by = p.y - b.y, d = Math.hypot(bx, by) || 1; if (d < 100) { const strength = (1 - d / 100) * 2; dx += bx / d * strength; dy += by / d * strength; } }
      for (const effect of game.effects) if (effect.type === 'warning' && effect.radius > 60) { const ex = p.x - effect.x, ey = p.y - effect.y, d = Math.hypot(ex, ey); if (d < effect.radius + 55) { const norm = d || 1; dx += (d ? ex / norm : 1) * 3; dy += ey / norm * 3; } }
      if (p.x < 110) dx += 3; if (p.x > 2290) dx -= 3; if (p.y < 110) dy += 3; if (p.y > 2290) dy -= 3;
      const len = Math.hypot(dx, dy) || 1; direction = { x: dx / len, y: dy / len };
    }
    const danger = game.enemies.some(e => Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 38) || game.effects.some(e => e.type === 'warning' && e.radius > 60 && e.life < .45 && Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 12);
    const dash = danger && !dashLast && game.dashCooldown <= 0; game.step(1 / 60, { ...direction, dash }); dashLast = dash; frames++;
  }
  return { character, seed, state: game.state, time: +game.time.toFixed(1), level: game.level, hp: +game.player.hp.toFixed(1), kills: game.kills, bossHp: game.boss ? +game.boss.hp.toFixed(1) : null, evolved: Object.keys(game.evolved).filter(k => game.evolved[k]), metrics: game.metrics };
}

if (process.argv.includes('--balance')) {
  for (const character of CHARACTERS) for (const seed of [12, 817, 2026]) console.log('BALANCE', JSON.stringify(runPilot(character.id, seed)));
}


test('all three archetypes can win using only movement, dash, and offered upgrades', () => {
  for (const character of CHARACTERS) { const result = runPilot(character.id, 12); assert.equal(result.state, 'won', JSON.stringify(result)); assert.ok(result.time > 370 && result.time < 420); assert.ok(result.evolved.length >= 2); assert.ok(result.hp > 0); assert.equal(result.bossHp, 0); assert.ok(result.metrics.peakEnemies <= 150); assert.ok(result.metrics.peakDrops <= 220); }
});
test('standing still with automatic choices loses before the boss for every archetype', () => {
  for (const character of CHARACTERS) { const game = new Game({ character: character.id, seed: 77 }); let frames = 0; while (game.state !== 'dead' && game.time < 200 && frames++ < 15000) { if (game.state === 'upgrade') game.chooseUpgrade(game.choices[0].id); else game.step(1 / 60, {}); } assert.equal(game.state, 'dead'); assert.ok(game.time > 30 && game.time < 200); }
});
