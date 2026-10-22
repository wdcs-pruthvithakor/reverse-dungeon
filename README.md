# The Reverse Dungeon

A strategy game where you play the dungeon, not the hero. Place traps, monsters and bosses, dig new floors, move your hoard, and trick adventurers into your chambers. Heroes who escape tell the guild what they saw, so the next party walks in knowing your layout and rated to beat it. You have to rebuild between raids.

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

There is no build step and no outside requests: the fonts ship in `fonts/` (SIL Open Font License) and sound effects are synthesised with Web Audio. Everything else (canvas rendering, AI and simulation) is hand-written vanilla JS. The whole game is about 260 KB.

New players get a one-click start on Apprentice and a guided first night (place a trap, place a monster, open the gate). The game fills one fixed screen at any landscape size; below 1150 px wide the Guild Ledger becomes a drawer, and portrait phones are asked to turn sideways.

## Modes, trophies and pacts

- **Campaign** is the full climb: hold 20–30 nights depending on difficulty.
- **Saga** is 100 nights. Ranks, floors, powers and guild strength move about four times slower than in Campaign (the Demon Lord arrives around night 97), so each rank of hero is a real fight and older pieces stay useful far longer. Income, kill bounties and the gold heroes drop are scaled down to match, so the hoard has to be defended all the way. Saga keeps digging past floor V. With the bot, Saga ends in a win about 5 times in 8 on Keeper and 1 in 8 on Overlord, with deaths spread across nights 50–90.
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
- You start with F-rank blueprints. Higher ranks unlock as you survive (E on night 3, D on 5, C on 8, up to SSS on 23 and the Demon Lord on 26). New floors can be dug on nights 4, 9, 14 and 19. The hoard is carried down to each new floor. A normal run stops at five floors; in endless mode and Saga the dungeon keeps going down, one floor every 50 nights (VI on night 50, VII on 100, and so on to X), each costing more.
- **Elite monsters** outfight a whole party of their own rank. **Bosses** (one per floor) summon, breathe fire or shake the ground. **Myth bosses** (Hydra, Behemoth) and the **Demon Lord** come late.
- The guild **rates your dungeon from what survivors saw**. Let someone escape after seeing your S-rank wyvern and S-rank parties come next. A strong piece nobody lives to report stays a secret. Heavy losses also push the rating up, and quiet nights let it drift down.
- Adventurers have ranks too. Classes open up with rank: Knight, Rogue, Mage, Cleric and Scout from the start, then Ranger and Monk (E), Berserker and Beast Tamer (D), Alchemist and Ninja (C), Bard and Samurai (B), and Dark Knight (A). Monks dodge, tamers calm beasts, ninjas slip pins and cages, samurai open with a heavy first strike, dark knights drain life. The guild builds parties by role: a tank, a healer once parties get big, a trap-finder when it knows about your traps, and someone who sees through illusions.
- Rare **legends** sometimes join: Paladin, Sword Saint, Shadow, Archmage, Saint, Dragonslayer, Shield Hero (draws every blow), Goblin Slayer (triple damage to goblinoids), Phantom Thief (walks through Boss Seals, steals double), Sage (cures and sees far), or the Chosen Hero.
- When the guild knows about one of your bosses, it often sends a **strike team** of higher-rank specialists who hunt the boss before going for the hoard. A known Demon Lord always brings the Chosen Hero.
- **Escaping is not enough to grow.** Heroes earn experience by killing monsters, looting, mapping, disarming and surviving damage. Only those who earned it come back stronger or a rank higher. Ones who ran with nothing may quit the guild.
- A high-rank hero partly shrugs off pins, dazes, slows and stuns from traps far below its rank.
- **The guild keeps up.** Adventurers in general track the ranks you have unlocked, even if nobody escapes. A party that vanishes makes the next one bigger and better supplied with Sending Stones. From night 15, every night the guild fails to take gold adds **renown** (shown as a `+` on the rating), making later heroes stronger. Easy nights do not last.

## Floors, hordes, rooms and seals

- **Floor types.** Digging a new floor asks *What lies below?* and offers three of eight themes: Stone Halls, Crypt, Forge, Frozen Hollow, Fungal Grotto, Arcane Sanctum, Beast Lair and Gilded Vault. A theme boosts pieces with matching tags (undead, fire, frost, poison, beast, arcane, mech, goblinoid) and some add an extra monster to every horde. The floor tab shows its theme.
- **Hordes.** A Kobold Warren, Orc Warband or Harpy Nest is a den that releases a pack of monsters when heroes come close.
- **Rooms.** A War Banner makes monsters within 2.5 tiles hit 25% harder with 15% more health; a Trapmaster's Sigil makes nearby traps hit 20% harder and rearm 40% faster.
- **Boss Seal** (A rank). Needs a boss on the floor, one per floor. While that boss lives, heroes on the floor can't take the stairs or leave by the gate, so fleeing heroes have to fight it, and anyone still sealed in at the time limit dies. Only the Phantom Thief can walk through. Selling the floor's last boss refunds the seal. The floor tab shows a lock.
- **More pieces.** Traps: Poison Needle, Alarm Bell, Iron Cage, Teleport Circle, Rolling Boulder, Gravity Well. Monsters: Kobold, Orc, Lizardman (regenerates), Harpy (ranged), Gargoyle (poses as a statue), Minotaur (charges), Basilisk (petrifies), Vampire (drains), Dullahan (fear), Chimera. Bosses: Orc Warlord, Minotaur King, Vampire Lord (myth).

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

## Guide and hero details

**Why they survived.** The dawn report shows how much damage each piece (or power) did and who it killed, the combos that landed, how much healers mended and how many traps rogues disarmed, the pieces that never touched a hero (and next night they are ringed in gold on the map), and up to three concrete fixes: kill the healers first, guard the hoard, move known traps, move idle pieces, back up the one piece doing all the work, or try a combo.

**Scry the raid** (next to Open the gate) costs malice (10 + 6 per unlocked rank) and rehearses tonight's actual party against your dungeon three times, out of sight, with every hero up to 10% stronger or weaker than the guess. A card gives the range of heroes who fall and gold taken and the pieces that will do the work; blue footprints on the map show where they walk, and pieces nobody would reach are ringed. Change anything and the scry is marked stale.

**One-way roads.** Two D-rank pieces. The **Drop Gate** is open when the raid begins and crashes down once the whole party has walked through it (the dead and anyone already running out don't count), until dawn; nobody can batter or pick it. The **Exit Gate** is shut when the raid begins and grinds open the moment a Drop Gate on its floor falls, and every hero on the floor hears both. So heroes come in one way and have to leave by the road you chose. Both may stand right beside the entrance, where a road naturally splits. Placement keeps both moments fair: with the exits shut the hoard must be reachable, and once the gates drop nothing heroes can reach now may be cut off, so nobody is walled in (a refused gate rings the corridors it would cut off in red) (Fill, Move and Sell follow the same rule, and selling a floor's last Drop Gate sells its Exit Gates). As a last safety net, a hero who somehow has no road left gets the nearest fallen gate back after a few seconds. The guild remembers gates, not walls.

**Bait Chests** (E rank) hold real coin (20 gold, +50% per level). Greedy heroes, and strike teams passing within 4 tiles, go out of their way for one and stand still for 2 seconds to open it: an ambush point. Kill the carrier and its gold stays put; let them out and it comes out of your hoard.

**Ghosts.** A legend who dies in your dungeon may come back where they fell (the Chosen Hero always does, other legends 45% of the time). A *Haunting* ghost frightens heroes who come within 2 tiles, a *Whispering* one tells the guild about a trap that isn't there or makes them forget a real one each night, and a *Vengeful* one rises every raid as a spectre at the rank it had in life and fights for you. At most 3 at once; each fades after 12 nights, a cleric, paladin, saint or sage who stands beside one for 3 seconds lays it to rest, and a vengeful one is laid to rest when killed. Ghosts are kept in the save and listed in the Guide's Ghosts tab.

**Undo and saved layouts.** Every build action (placing, selling, moving, levelling, digging, filling, digging a floor, rerolling deals) can be undone with **Undo** or Ctrl/⌘+Z until the gate opens, with every bit of malice refunded. **Layouts** keeps three slots per floor: save the floor's corridors and pieces, then rebuild it later in one go through the normal rules, paying only for what differs (non-matching pieces are sold, missing ones placed and levelled, rock dug or filled). The dialog shows each slot's exact cost, worked out on a copy of the dungeon, and lists anything that can't be placed. A rebuild can be undone too.

**Abyss Gate.** Heroes coming in are thrown back out to the front gate (with a flash and a shout there) and have to walk it all again; heroes trying to leave are thrown into the deepest corner of their floor instead, so it is never a shortcut home. Behind a Drop Gate, a hero thrown back out still counts as through it: the gate falls once everyone has walked through it once, and anyone outside by then comes back in by the Exit Gate road.

**Mortal Monsters** (a twist, +15% score) is a hardcore mode: a monster that dies in a raid is gone for good, bosses and hordes included (a boss seal goes with the last boss of its floor), and you can keep at most 8 monsters plus 4 per floor (a strong ordinary build keeps 10–18 by night 30, so the cap only bites monster-heavy builds). The dawn report lists who fell.

**Combos.** A hero already caught by one thing takes more from the next: *Skewered* (pinned or caged, then hit by a trap or wall piece, +50%), *Shatter* (slowed, then a crushing trap, ×2), *Kindling* (poisoned or in gas, then fire, +30% and a blast on everyone close), *Ambush* (dazed, then a monster, +50%), *Pile-on* (knocked down, then a monster, +40%) and *Panic* (terrified, then a monster, +25%). The name flashes over the hero; the first time you land one it is added to the Guide's Combos tab, where the rest are only hinted. With the bot, Keeper wins stayed at 6 in 8.

**How to play** (start screen, or the Guide's first tab) has 22 short looping scenes drawn with the game's own art: the gate, the hoard, malice, placing pieces, traps, monsters, dig and fill, move, level up, sell, moving the hoard, the guild's memory, floors and stairs, raid powers, ranks, bosses with the Boss Seal, one-way roads, bait chests, ghosts, undo and layouts, combos, and scrying. Each has **Show me on the map**, which closes the guide and lights up the real thing: a gold ring on the gate, hoard or stairs, or a pulsing outline on the counter, toolbar or button it means. The scenes live in `js/howto.js`.

**Guide** (top bar, or on the start screen) lists everything in the game, locked or not: the basics, every power with its icon, cost, recharge and opening night, every piece with its numbers, all 25 hero classes with their abilities, traits, floor types, omens and twists. Every piece, power and class in the Guide opens a full page, and so does any placed piece clicked with the **Info** tool (first in the toolbar) or, during a raid, any hero, monster or trap you click with no power selected. A piece's page has its numbers at its level and rank, a Lv1–5 table, what its floor and nearby rooms add, who can spot, disarm or out-damage it, and for bosses and hordes, what they bring: summons fight one rank below their boss (never below their own blueprint) at the boss's level, and horde packs fight at the den's rank, so a Demon Lord's imps are SSS-rank and a Lich's skeletons B-rank. The **Summons & hordes** tab lists them all with those real numbers. Click any hero in the Ledger or the dispatch card for their full stats (health, damage, reach, speed, sight, when they run), abilities in numbers (a healer's health per second and range, a rogue's disarm time, detection chances), traits, and, during a raid, what they are doing right now. Hovering or tapping a raid power shows its name, cost and effect above the bar.

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
| Grasping Mire | night 2 | Holds heroes around a tile for 1.5s, then halves their speed for 6s |
| Phantom Gold | night 3 | A false hoard that heroes still hunting for gold walk to |
| Cave-in | night 5 | Blocks a corridor tile for 8s. Heroes take another way if there is a sensible one, otherwise wait for it to clear |
| Overcharge | night 6 | Every trap rearms at once, even disarmed ones, and jammed wall traps shake free |
| Bloodlust | night 8 | Monsters hit harder, attack faster and run faster for 7s |
| Dark Mending | night 9 | Every monster heals half its health |
| Raise the Dead | night 11 | Two skeletons appear where you click |
| Dread Whisper | night 12 | Heroes around a tile run at the first scratch for 8s |
| Seal the Gate | night 14 | Nobody can leave for 6s, so nobody reports |
| Doom Bolt | night 16 | A quarter of one hero's health (a sixth for legends); cannot be dodged |
| Banish | night 19 | Sends one hero to the far side of their floor, dazed |

Past seven open powers the bar shows icons and costs only; hover one for its name.

**Stacking rules.** No single piece is weakened, but pieces can't be chained into an unbeatable maze: a hero who shakes off a Wandering Rune keeps their head for 8 seconds; a Soul Siphon tears 30% of a hero's *current* health, and a torn soul only tears again once the hero has been healed back above 80% of their health (later siphons on a still-torn hero do their flat damage); Storm Pylon lightning needs line of sight, pylons need 4 tiles between them, dart slits 2 (no two side by side), heroes see a pylon's whole danger circle, and rogues who have felt a pylon or dart slit can jam it for 12 seconds (it takes them three times as long as disarming a trap, under fire). `node tools/fortress.js 3 3` (add `old` to switch the rules off) measures a deep Rune/Siphon/Pylon fortress against an SSS strike force; with the rules on it kills about 40% instead of 84%. Since pylon jams became temporary (12s), pylons are the strongest piece on that test: a pylon-only build kills about 39%, against 8% for golems and wyverns on the same budget.

**The dungeon talks.** The Core, your dungeon's voice, comments on kills, escapes, thefts, fallen bosses and the powers you use. Each night opens with a **Guild dispatch** card listing who is coming, their traits (💰 Greedy, 😨 Craven, 💢 Reckless, 👁 Keen-eyed, 🔮 Sending Stone, 🛡 Stout, 💨 Swift) and what each class does. A heavy blow freezes the raid for a few frames, the last kill of the night plays in slow motion, and the dawn report stamps a **night grade** from S (nobody escaped, nothing taken) to F. **Share report** saves a picture of the night with a link to the same dungeon, or opens the device's share sheet where there is one.

First-time players skip the menu and go straight into the guided first night, so the first raid starts within seconds.

Monsters guard their posts, but run down anyone fleeing or carrying gold (fast monsters furthest; bosses never leave their lair). During a raid the view follows the heroes between floors. Pick a floor yourself and it stays there until you press **Follow heroes** again. Heroes call out what is happening in speech bubbles, and a small eye marks every trap the party already knows about.

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

The game saves itself (in the portal's data module when there is one, else `localStorage`) at the start of every night and after every build action. There are **three save slots**, each holding its own dungeon. The start screen lists them with mode, difficulty, night, gold, floors and when each was last played: **Continue** one, **Delete** one (it asks twice), or click a slot to choose where the next new dungeon goes (the note under Play says whether it fills an empty slot or replaces one). The slot you last played is remembered. A save from before slots existed becomes slot 1. A refresh during a raid replays that night from where you left your build. A refresh during the dawn report continues with the next night. Saves from before ranks and floors existed are migrated: pieces keep their upgrades as levels, and tonight's party is hired again with ranks.

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
| `js/howto.js` | The How to play scenes: a tiny scene engine and one scripted loop per lesson |
| `js/ui.js` | DOM panels, floor tabs, stat panel, tutorial, modals, input, portal hooks and the frame loop |
| `fonts/` | Bundled Jacquard 24, Alegreya Sans and DM Mono (latin subset) with their licenses |
| `tools/` | Headless tools, not part of the game upload: `check.js` (regression checks), `balance.js <difficulty> <games> <nights> <mode>` (a competent bot measures difficulty; `OLD_RULES=1` switches the stacking rules off), `stacks.js <night>` and `killbox.js <night>` (same-budget builds against the same party), `fortress.js <maps> <trials> [old]` (a deep trap fortress against an SSS strike force), `survey.js <night>` (each piece type alone on the same budget, to spot over- and under-priced pieces) |
