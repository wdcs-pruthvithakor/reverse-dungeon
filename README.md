# The Reverse Dungeon

A strategy game where you play the dungeon, not the hero. Place traps, dig and fill corridors, move your hoard, and trick adventurers into your chambers. Heroes who escape tell the guild what they saw, so the next party walks in knowing your layout. You have to rebuild between raids.

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

There is no build step. Fonts load from Google Fonts. Everything else (canvas rendering, AI and simulation) is hand-written vanilla JS.

## How a night works

1. **Build.** Spend malice on traps, monsters, doors and dart slits. Moving a piece is free. Dig or fill corridors, or haul the hoard somewhere new. **Rank** up a placed piece for +40% damage, health or toughness per rank. Each rank costs more than the last, and a rank badge shows on the piece. Heroes get stronger every raid, so ranks are how a full dungeon keeps up, especially in endless mode.
2. **Raid.** Heroes enter carrying the guild's map. They path around traps they know about, rogues disarm them, mages see through illusions, and greedy heroes detour for chests (mimics).
3. **Reckoning.** Survivors and any hero carrying a *Sending Stone* report to the guild. Their intel shows up as tavern talk with grid coordinates. Heroes who die take what they learned with them.

Hold the hoard for 10 raids to win. You can keep going in endless mode after that.

## What keeps it unpredictable

- **Seeded dungeons.** Every seed carves a different layout, with the entrance on a random side.
- **Random blueprint offers** each night, with one of them on sale.
- **Omens** such as Blood Moon, Sold Survey, Feuding Party and Wet Torches change the rules for one night.
- **Heroes** get random names and traits (Greedy, Craven, Reckless, Keen-eyed, Stout, Swift, Sending Stone). Survivors can come back as stronger veterans.
- **The guild adapts.** Whatever killed the most heroes decides who it hires next (rogues against traps, mages against illusions, knights and clerics against monsters). When it catches your walls moving, it gets warier and sends scouts.
- **Knowledge is stale.** The guild's map only shows what was true when someone escaped. Toggle **Guild's map** (`G`) to see what they believe. Stale entries are crossed out.

## Controls

| Key / input | Action |
|---|---|
| Click map | Use the selected blueprint or tool |
| Right-click / `Esc` | Cancel a move or a power |
| `Space` | Open the gate (build), pause/resume (raid) |
| `G` | Toggle the guild's map |
| `1` `2` `4` | Raid speed |

During a raid, **Tremor** knocks down heroes around a tile, and **Douse** snuffs every torch so heroes can't spot traps.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Page shell |
| `css/style.css` | Visual system, responsive layout |
| `js/data.js` | Pieces, hero classes, traits, omens, names, tavern talk, seeded RNG |
| `js/world.js` | Grid helpers, map generation, building rules, guild knowledge, party generation |
| `js/sim.js` | Raid simulation: hero AI, detection, traps, monsters, reports, debrief |
| `js/render.js` | Canvas drawing, torchlight, guild's-map overlay, icons |
| `js/ui.js` | DOM panels, modals, input and the frame loop |

## Saving

The game saves itself in `localStorage` at the start of every night and after every build action. When you reopen the page you can **Resume** or start a new dungeon. A refresh during a raid replays that night from where you left your build. A refresh during the dawn report continues with the next night. The best run is saved there too. Use **New dungeon** in the header to start over.
