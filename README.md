# 燈火守夜人 · Lanternfall

An original, dependency-free Canvas2D survival roguelite. Traditional Chinese interface, original code-drawn pixel sprites, responsive desktop/mobile controls, and a six-minute escalation followed by the final boss.

## Play
- WASD / arrow keys: move. Weapons target automatically.
- Space: dash with brief invulnerability.
- P / Escape: pause. 1–3: choose a level-up blessing.
- Touch: left joystick and right dash button.
- Gather starlight, select one of three upgrades, and combine weapon rank III with its matching passive rank II to evolve it.
- Defeat the boss that appears at 06:00 to win. Merely surviving six minutes does not finish the run.

## Evolution recipes
- 焰矢 III + 力量 II → 鳳凰齊射
- 月刃 III + 疾行 II → 森羅月輪
- 雷印 III + 急速 II → 星界雷暴
- 霜環 III + 拾光 II → 永冬之月

## Run and test
Requires Node.js 18+ for tests only. No npm dependencies or build step.

```sh
npm test
python3 -m http.server 8080
```

Serve the directory over HTTP (ES modules). GitHub Pages deploys `main` from the root directory.

## Implementation
`engine.js` contains seeded fixed-step simulation, collision, invulnerability, finite spawn/projectile/drop budgets, conserved XP merging, enemy telegraphs, and upgrade/state handling. `art.js` draws original sprites and the world. `app.js` handles responsive controls, menus, HUD and optional synthesized audio. Tests distinguish pure simulation and mocked DOM integration from actual-browser verification.

## Privacy and accessibility
No analytics, accounts, remote assets, payment or backend. Only high score, win count and audio/motion preferences are stored locally. Audio starts off; reduced-motion follows the operating-system preference initially and can be toggled. Losing focus pauses play. Keyboard buttons have visible focus states. Game requires visual tracking and is not fully screen-reader playable.

All art, characters, game title, and assets are original. No assets or branding from the reference game are used.
