# The computer player

The computer can play a clan in place of people. It is meant for testing and for a clan nobody is playing.

## When the computer plays

The owner decided this on 2026-11-26:

- **The computer plays a clan only when the campaign owner sets it to.** The owner chooses, for each clan, "Its
  players" or "The computer" in the season dialog, under "Who plays each clan". The choice can be changed at any
  time and carries into later seasons.
- **The computer never steps in by itself.** If a clan of people submits nothing before the daily deadline, that
  clan gives no orders that turn. Its colonies still earn income. The turn resolves on time either way, so a
  campaign does not stall.
- While a clan is set to the computer, orders sent by its players are refused and they see a notice on their
  command deck. Orders they had already submitted are kept: if the owner hands the clan back before the turn
  resolves, those orders are the ones carried out.
- Every clan can see who plays each clan, and gets a report when it changes.
- With three or four clans the computer treats every other clan as an enemy. It never offers or accepts an alliance ([CLANS.md](CLANS.md)).

A new campaign still starts with the second clan (Ember Empire) played by the computer unless the server is
started with `EmpireAi=false`. That suits a one-person test. For a game between two groups of people, the owner
sets Ember Empire to "Its players" before the first turn, or starts the server with `EmpireAi=false`.

With clan keys instead of accounts there is no owner, so the control is available only to a local test session.

## How it plays

The computer plans from the same fogged view a player of that clan sees, and its orders pass the same checks as a
person's. It has no hidden information and cannot break a rule.

In campaigns with a mode (simple or advanced) it:

- gathers four ships at a colony that borders a system it does not hold, then sends all but one to that system;
- between otherwise equal targets, prefers the one its own deep scouts reported as more habitable, because
  inhabitants grow faster there; a system it has no report for counts as average, and it never sees a hidden score;
- prefers empty systems, and puts a system where it met the other clan in the last three turns at the end of its
  list. If only such a system is left it gathers at least eight ships, or twice what it saw there, before attacking;
- forwards ships from colonies with no such border toward the nearest colony that has one;
- pays for those expeditions before anything else, then buys collectors until it has enough to win (in advanced
  mode also a colony's first three, because they add income), then scouts, then more ships;
- in advanced mode, counters the ship types it last saw, builds a fixed defense when the other clan was seen next
  door, and puts spare credits into mines and settlement growth;
- in advanced mode, moves collector materials by freighter. A collector needs one Ceryth and one Soryl within the
  same colony's reach, and a homeworld's starting stock runs out near the eleventh. When the collectors it still
  owes need more than the colony with the most collectors can reach, it sends one freighter to each colony that
  holds some and brings back as much as the freighter carries, one jump a turn, relaying through its own colonies.
  It does not build freighters or gates; it uses the two freighters a homeworld starts with.

It does not use freighters, gates or ship design, it does not coordinate several colonies against one target, and
it does not defend a threatened colony by recalling ships. It is a sparring partner, not a strong opponent.

Campaigns saved before modes existed, including the running family playtest, keep the original computer player
exactly as it was.

## For developers

- `Ai.Plan` in `src/Deepfield.Engine/Ai.cs` is the planner for campaigns with a mode. `Rules.PlanAi` calls it, and
  otherwise falls back to the original planners.
- `Ai.SetControl` changes who plays a clan; `POST /api/admin/clan` with `{ "team": 1, "computer": true }` calls it.
- The campaign view carries `seats`: each clan's name and whether the computer plays it.
