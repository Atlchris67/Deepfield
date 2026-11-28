# Simple and advanced mode

A campaign is played in one of two modes. The mode is one choice made by the game creator; it replaces choosing
the economy, combat, logistics and materials rule versions one by one. The owner confirmed this split on
2026-11-26.

| Area | Simple | Advanced |
| --- | --- | --- |
| Map, fog, seasons, winning condition | Same | Same |
| Scouting (distant, close, deep) | Same | Same |
| Habitability reports | Shown | Shown |
| Inhabitants | Same | Same |
| Economy | 5 to 15 credits per colony, by its inhabitants | The same, plus collector income of 3, 2, 1 for a colony's first three collectors |
| Fixed defenses | Not available | Available |
| Ships | One generic ship, 5 credits | Ship types and ship design |
| Combat | Equal losses; survivors take the colony | Typed-fleet combat |
| Materials, mines, settlement growth | Not available: everything costs credits only | Available |
| Local stockpiles, freighters, gates | Not available | Available |
| Clan industrial focus | Not available | Available |

Both modes are played on the real-star map. New campaigns are no longer created on the original fictional map.

**Inhabitants, in both modes** (owner decision, 2026-11-27). Every colony has between 0 and 100 inhabitants.

- A homeworld starts full. A colony is founded with 20.
- Each turn a colony gains 3 inhabitants on the harshest world and 15 on the kindest: 3 plus one for every 8 points
  of habitability. Habitability changes nothing else. It never decides whether a colony can be founded.
- A colony earns 5 credits plus 1 for every 10 inhabitants: 7 when founded, 15 when full. A full colony earns what
  every colony used to, so the opening is unchanged and a new colony takes 6 to 27 turns to reach full income.
- A colony that falls loses its inhabitants. The clan that takes it starts again from 20.
- A clan sees the inhabitants of any colony it can currently see, and the growth, income and habitability score of
  its own colonies. For a system it does not hold, habitability still comes only from a returning deep scout.

Inhabitants are not settlement size. Settlement size is an advanced-mode purchase that raises material output.

Campaigns saved before this rule keep a flat 15 credits per colony until their next season starts.

## Who chooses, and when

- **A new hosted server** starts its first campaign in simple mode, or in the mode given by the `Mode` setting
  ([HOSTING.md](HOSTING.md)).
- **The campaign owner** can change the mode in the season dialog:
  - for the current season, only until its first turn resolves. The season is set up again on the same map under
    the new rules, and any orders already submitted for that turn are cleared, with a report to both clans;
  - for the next season, when starting it. A season keeps the previous mode unless a new one is chosen.
- **The local test tool** ("Start new game") has the same single choice and defaults to advanced. Industrial
  focus per clan is set there. The season dialog does not have industrial-focus controls: a hosted advanced
  season starts balanced, or keeps the focus of the previous advanced season.
- Both clans see the mode in the season dialog.
- The computer can play a clan in either mode when the owner sets it to ([COMPUTER-PLAYER.md](COMPUTER-PLAYER.md)).

## Existing campaigns

A campaign saved before modes existed has no mode. It keeps exactly the rule versions it was saved with, in the
current season and in later ones, unless its owner picks a mode when starting a season. The running family
playtest is such a campaign and is not converted.

A save whose mode does not match its stored rules is rejected when loaded.

## For developers

- `Modes.Create` in `src/Deepfield.Engine/Modes.cs` is the one place that maps a mode to rule versions:
  simple is economy 0, combat 0, logistics 0 with no material stock; advanced is economy 1, combat 1,
  logistics 1, materials 1.
- The rule-version fields remain in the save so older campaigns keep working. They are no longer offered as
  choices in the interface or to a hosted server.
- A clan-key development server still honours `EconomyVersion` and `CombatVersion` when `Mode` is not set, so
  existing launch scripts and tests behave as before. Set `Mode` to create a development campaign in a mode.
