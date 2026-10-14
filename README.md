# The Reverse Dungeon

A strategy game where you play the dungeon, not the hero. Place traps, monsters and bosses, dig new floors, move your hoard, and trick adventurers into your chambers. Heroes who escape tell the guild what they saw, so the next party walks in knowing your layout and rated to beat it. You have to rebuild between raids.

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

There is no build step. Fonts load from Google Fonts. Everything else (canvas rendering, AI and simulation) is hand-written vanilla JS.

## How a night works

1. **Build.** Spend malice on traps, wall pieces, doors, monsters and bosses. Moving a piece is free, even between floors. Dig or fill corridors, or haul the hoard somewhere new. **Level up** a placed piece (Lv1–5, +15% per level). Hover any piece to see its numbers, and with the Level tool, the before and after.
2. **Raid.** Heroes enter carrying the guild's map. They path around traps they know about, take the stairs down when they find them, rogues disarm, mages see through illusions, and greedy heroes detour for chests (mimics). The camera follows them between floors.
3. **Reckoning.** Survivors and any hero carrying a *Sending Stone* report to the guild. Their intel shows up as tavern talk with coordinates (`II·F7` is floor II, column F, row 7). Heroes who die take what they learned with them. The last five raids, full logs included, are kept under **Raid reports**.

Hold the hoard for the nights your difficulty asks (20–30) to win. You can keep going in endless mode after that.

## Ranks, unlocks and the guild's rating

- Everything has a rank: **F, E, D, C, B, A, S, SS, SSS**, plus **EX** for the Demon Lord. Each rank is 1.5× stronger than the one below.
- You start with F-rank blueprints. Higher ranks unlock as you survive (E on night 3, D on 5, C on 8, up to SSS on 23 and the Demon Lord on 26). New floors can be dug on nights 4, 9, 14 and 19. The hoard is carried down to each new floor.
- **Elite monsters** outfight a whole party of their own rank. **Bosses** (one per floor) summon, breathe fire or shake the ground. **Myth bosses** (Hydra, Behemoth) and the **Demon Lord** come late.
- The guild **rates your dungeon from what survivors saw**. Let someone escape after seeing your S-rank wyvern and S-rank parties come next. A strong piece nobody lives to report stays a secret. Heavy losses also push the rating up, and quiet nights let it drift down.
- Adventurers have ranks too, and sometimes a rare **legend** joins: Paladin, Sword Saint, Shadow, Archmage, Saint, or the Chosen Hero, who always answers a known Demon Lord.

## Difficulty

| Mode | What changes |
|---|---|
| Apprentice | More gold and malice, weaker heroes, slower guild. Hold 20 nights. |
| Keeper | The game as designed. Hold 25 nights. |
| Overlord | Tougher heroes, leaner income, the guild climbs faster. Hold 25 nights. |
| Abyss | Bigger parties, legends often, little gold. Hold 30 nights. |

## What keeps it unpredictable

- **Seeded dungeons.** Every seed carves different floors, with the entrance on a random side.
- **Random blueprint offers** each night from the ranks you have unlocked, one of them on sale.
- **Omens** such as Blood Moon, Sold Survey, Feuding Party and Wet Torches change the rules for one night.
- **Heroes** get random names, ranks and traits (Greedy, Craven, Reckless, Keen-eyed, Stout, Swift, Sending Stone). Survivors can come back as stronger veterans, sometimes a rank higher.
- **The guild adapts.** Whatever killed the most heroes decides who it hires next. When it catches your walls moving, it gets warier and sends scouts.
- **Knowledge is stale.** Toggle **Guild's map** (`G`) to see what they believe. Stale entries are crossed out.

## Controls

| Key / input | Action |
|---|---|
| Click map | Use the selected blueprint or tool |
| Right-click / `Esc` | Cancel a move or a power |
| `Space` | Open the gate (build), pause/resume (raid) |
| `G` | Toggle the guild's map |
| `[` `]` | Previous / next floor |
| `1` `2` `4` | Raid speed |

During a raid, **Tremor** knocks down heroes around a tile, and **Douse** snuffs every torch so heroes can't spot traps.

## Saving

The game saves itself in `localStorage` at the start of every night and after every build action. When you reopen the page you can **Resume** or start a new dungeon. A refresh during a raid replays that night from where you left your build. A refresh during the dawn report continues with the next night. Saves from before ranks and floors existed are migrated: pieces keep their upgrades as levels, and tonight's party is hired again with ranks.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Page shell |
| `css/style.css` | Visual system, responsive layout |
| `js/data.js` | Ranks, difficulty, pieces, bosses, hero classes, traits, omens, names, tavern talk, seeded RNG |
| `js/world.js` | Grid and floors, map generation, building rules, guild knowledge and rating, party generation, save/load |
| `js/sim.js` | Raid simulation: hero AI, stairs, detection, traps, monsters, boss abilities, reports, raid history |
| `js/render.js` | Canvas drawing per floor, torchlight, guild's-map overlay, glyphs and rank badges |
| `js/ui.js` | DOM panels, floor tabs, stat panel, modals, input and the frame loop |
