# The Reverse Dungeon

A strategy game where you play the dungeon, not the hero. Place traps, monsters and bosses, dig new floors, move your hoard, and trick adventurers into your chambers. Heroes who escape tell the guild what they saw, so the next party walks in knowing your layout and rated to beat it. You have to rebuild between raids.

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

There is no build step and no outside requests: the fonts ship in `fonts/` (SIL Open Font License) and sound effects are synthesised with Web Audio. Everything else (canvas rendering, AI and simulation) is hand-written vanilla JS. The whole game is about 260 KB.

New players get a one-click start on Apprentice and a guided first night (place a trap, place a monster, open the gate). The game fills one fixed screen at any landscape size; below 1150 px wide the Guild Ledger becomes a drawer, and portrait phones are asked to turn sideways.

## Modes, trophies and pacts

- **Campaign** is the full climb: hold 20–30 nights depending on difficulty.
- **Quick** is 12 nights in which everything (ranks, floors, guild strength, income) moves 2.2× faster, so a 15–25 minute run still reaches bosses and the Demon Lord.
- **Daily dungeon** uses Quick rules on Keeper with a seed taken from today's date, plus two **twists** rolled for the day, so everyone gets the same unusual dungeon. Your best score for each day is kept.
- **Twists** change one run's rules (Gold Fever, Swarm, Burned Archive, Sending Stones, Buyer's Market, Age of Thrones, Endless Night, Age of Legends, Glass Fangs, Rush). Pick any for Campaign or Quick; each adds 15% to the score.
- **Challenge a friend** from the final screen: the link starts them on your exact seed, mode, difficulty and twists, with your score to beat. On CrazyGames it uses the SDK's invite link.
- Every run ends with a **score** (nights held, heroes slain, legends, and a bonus for winning), and the best is kept per mode and difficulty.
- **Souls** are earned from every run's score (and from nemeses) and spent in the **Dungeon Heart** on permanent upgrades: more starting malice or gold, faster power recharge, cheaper rerolls, bigger nemesis bounties, cheaper floors. Playing on consecutive days builds a **streak**, and the first dungeon of each day pays souls.
- **Nemeses:** a hero who escapes you twice becomes a nemesis. They always come back, a little stronger, and killing one pays a triple bounty.
- **21 trophies** carry across every dungeon. Seven of them unlock a **Dark Pact**, a perk you can take into a new run: more starting malice or gold, cheaper monsters or bosses, tougher doors and faster traps, four nightly deals, or fewer Sending Stones.

## How a night works

1. **Build.** Everything you have unlocked is always in the catalogue, and three random pieces are 30% off each night. Moving a piece is free, even between floors. Dig or fill corridors, or haul the hoard somewhere new. **Level up** a placed piece (Lv1–5): each level adds 15% to damage and health, 15% to how long it pins, dazes, slows or stuns, and makes traps rearm 6% faster. Hover any piece to see its numbers, and with the Level tool, the before and after.
2. **Raid.** Heroes enter carrying the guild's map. They path around traps they know about, take the stairs down when they find them, rogues disarm, mages see through illusions, and greedy heroes detour for chests (mimics). The camera follows them between floors.
3. **Reckoning.** Survivors and any hero carrying a *Sending Stone* report to the guild. Their intel shows up as tavern talk with coordinates (`II·F7` is floor II, column F, row 7). Heroes who die take what they learned with them. The last five raids, full logs included, are kept under **Raid reports**.

Hold the hoard for the nights your difficulty asks (20–30) to win. You can keep going in endless mode after that.

## Ranks, unlocks and the guild's rating

- Everything has a rank: **F, E, D, C, B, A, S, SS, SSS**, plus **EX** for the Demon Lord. Each rank is 1.5× stronger than the one below.
- You start with F-rank blueprints. Higher ranks unlock as you survive (E on night 3, D on 5, C on 8, up to SSS on 23 and the Demon Lord on 26). New floors can be dug on nights 4, 9, 14 and 19. The hoard is carried down to each new floor.
- **Elite monsters** outfight a whole party of their own rank. **Bosses** (one per floor) summon, breathe fire or shake the ground. **Myth bosses** (Hydra, Behemoth) and the **Demon Lord** come late.
- The guild **rates your dungeon from what survivors saw**. Let someone escape after seeing your S-rank wyvern and S-rank parties come next. A strong piece nobody lives to report stays a secret. Heavy losses also push the rating up, and quiet nights let it drift down.
- Adventurers have ranks too. Classes open up with rank: Knight, Rogue, Mage, Cleric and Scout from the start, then Ranger (E), Berserker (D), Alchemist (C) and Bard (B). The guild builds parties by role: a tank, a healer once parties get big, a trap-finder when it knows about your traps, and someone who sees through illusions.
- Rare **legends** sometimes join: Paladin, Sword Saint, Shadow, Archmage, Saint, Dragonslayer, or the Chosen Hero.
- When the guild knows about one of your bosses, it often sends a **strike team** of higher-rank specialists who hunt the boss before going for the hoard. A known Demon Lord always brings the Chosen Hero.
- **Escaping is not enough to grow.** Heroes earn experience by killing monsters, looting, mapping, disarming and surviving damage. Only those who earned it come back stronger or a rank higher. Ones who ran with nothing may quit the guild.
- A high-rank hero partly shrugs off pins, dazes, slows and stuns from traps far below its rank.
- **The guild keeps up.** Adventurers in general track the ranks you have unlocked, even if nobody escapes. A party that vanishes makes the next one bigger and better supplied with Sending Stones. From night 15, every night the guild fails to take gold adds **renown** (shown as a `+` on the rating), making later heroes stronger. Easy nights do not last.

## Difficulty

| Mode | What changes |
|---|---|
| Apprentice | More gold and malice, weaker heroes, slower guild. Hold 20 nights. |
| Keeper | The game as designed. Hold 25 nights. |
| Overlord | Tougher heroes, leaner income, the guild climbs faster. Hold 25 nights. |
| Abyss | Bigger parties, legends often, the guild grows fastest. Hold 30 nights. |

Balance was tuned with headless bot games. A bot that builds kill zones, re-traps known spots and keeps everything levelled reaches the win on Keeper about half the time and on Overlord about one time in five. It always holds on Apprentice and rarely survives Abyss. In endless mode every run eventually falls; on Keeper that bot lasts to nights 25–50. The dials live in `RD.BAL` and `RD.DIFF` in `js/data.js`.

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
| Tap map (touch) | First tap shows what would happen; tap the same tile again to do it |
| `+` / `−`, pinch, `Ctrl`+wheel | Zoom the map; drag or scroll to look around when zoomed. During raids the view follows the heroes |
| Right-click / `Esc` / **Cancel** | Cancel a move or a power |
| `Space` | Open the gate (build), pause/resume (raid) |
| `G` | Toggle the guild's map |
| `[` `]` | Previous / next floor |
| `1` `2` `4` | Raid speed |

### Raid powers

Powers open as the run goes on (Quick runs reach them sooner), and cost more malice as your ranks rise.

| Power | Opens | What it does |
|---|---|---|
| Tremor | night 1 | Knocks down heroes around a tile |
| Douse | night 1 | Snuffs every torch: heroes see one tile and can't spot traps |
| Phantom Gold | night 3 | A false hoard that heroes still hunting for gold walk to |
| Cave-in | night 5 | Blocks a corridor tile for 8s |
| Bloodlust | night 8 | Monsters hit harder, attack faster and run faster for 7s |
| Raise the Dead | night 11 | Two skeletons appear where you click |
| Seal the Gate | night 14 | Nobody can leave for 6s, so nobody reports |

Monsters guard their posts, but run down anyone fleeing or carrying gold (fast monsters furthest; bosses never leave their lair). If you look at another floor during a raid, the view returns to the heroes after a few seconds. Heroes call out what is happening in speech bubbles, and a small eye marks every trap the party already knows about.

## Web portals

`js/portal.js` adapts the game to CrazyGames SDK v3. The SDK is only loaded when the game runs on a CrazyGames domain (or locally with `?portal=crazygames`, which uses the SDK's local test mode); everywhere else the adapter does nothing and no ads exist.

| Moment | What the game does |
|---|---|
| Loaded and fonts ready | `loadingStop` |
| Leaving a menu or report into the dungeon / opening one | `gameplayStart` / `gameplayStop` |
| "Prepare the next night", from night 3 on | a midgame ad break (the SDK decides whether one plays) |
| Ad starts / ends | the raid freezes, sound mutes, gameplay stops / everything resumes |
| 🎬 Reroll free | optional rewarded ad, once a night; deals can always be rerolled for malice |
| 🎬 Second chance | optional rewarded ad once per dungeon after the hoard is emptied, beside an equal-sized "Accept defeat" |
| Perfect night, legend slain, new floor, victory | `happytime` |
| Saves | the SDK data module (synced to the player's account), else `localStorage` |

To submit, upload `index.html`, `css/`, `js/` and `fonts/`. When submitting on CrazyGames, enable "Progress Save → Data Module".

## Saving

The game saves itself (in the portal's data module when there is one, else `localStorage`) at the start of every night and after every build action. When you reopen the page you can **Resume** or start a new dungeon. A refresh during a raid replays that night from where you left your build. A refresh during the dawn report continues with the next night. Saves from before ranks and floors existed are migrated: pieces keep their upgrades as levels, and tonight's party is hired again with ranks.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Page shell |
| `css/style.css` | Visual system, responsive layout |
| `js/data.js` | Ranks, difficulty, pieces, bosses, hero classes, traits, omens, names, tavern talk, seeded RNG |
| `js/world.js` | Grid and floors, map generation, building rules, guild knowledge and rating, party generation, save/load |
| `js/sim.js` | Raid simulation: hero AI, stairs, detection, traps, monsters, boss abilities, reports, raid history |
| `js/render.js` | Canvas drawing per floor, torchlight, guild's-map overlay, glyphs and rank badges |
| `js/audio.js` | Synthesised sound effects and the mute switch |
| `js/portal.js` | Web portal adapter (CrazyGames SDK v3): gameplay events, ads, cloud saves |
| `js/ui.js` | DOM panels, floor tabs, stat panel, tutorial, modals, input, portal hooks and the frame loop |
| `fonts/` | Bundled Jacquard 24, Alegreya Sans and DM Mono (latin subset) with their licenses |
| `tools/` | Headless tools, not part of the game upload: `node tools/check.js` runs regression checks, `node tools/balance.js <difficulty> <games> <nights> <mode>` lets a competent bot play to measure difficulty |
