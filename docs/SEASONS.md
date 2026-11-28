# Seasons

A campaign is played as a sequence of **seasons**. A season is one game on one map, from two homeworlds to a
victory. When it is decided, the campaign owner starts the next season on a new map.

## How a season ends

A season is decided when a clan meets the **winning condition** at the end of a turn. Two clans meeting it in the
same turn share the victory. No further turns resolve and no more orders are accepted.

## The winning condition

The game creator chooses it. It has three settings:

| Setting | Standard | Allowed |
| --- | --- | --- |
| Colonies to win | 4 | 2 to 12 |
| Collectors to win | 8 | from the number of colonies up to 60 |
| Turn limit | none (0) | 5 to 365 turns |

With a turn limit, a season nobody has won by the end of that turn goes to the clan with more colonies, then more
collectors. Equal clans share the victory.

- **Who sets it:** the campaign owner (on a clan-key development server, a local test session), in the season
  dialog. A hosted server can also be given starting values with the `Victory` settings in
  [HOSTING.md](HOSTING.md).
- **When:** for the current season, only until its first turn resolves, so nobody has planned around a rule that
  then changes. For the next season, when starting it. A season keeps the previous condition unless a new one is
  given.
- Both clans always see the current condition on the command deck and in the season dialog, and get a report when
  it changes.

Both clans then see the **victory screen**: the result, the final standings of both clans (colonies, collectors,
ships), how many turns it took and the date. Closing it leaves the final map on screen with a results banner;
"Show results" reopens it.

## Starting the next season

- **Who:** the campaign owner (personal accounts). On a clan-key development server, only a local test session.
- **Where:** the victory screen, or the "Season N" button on the command deck.
- **When:** once the season is decided. An undecided season can be ended early, but only after ticking
  "End season N now, without a winner". It is recorded as ended early.
- It cannot be undone. The request names the season it replaces, so a double click cannot skip a season.

| Carries over | Starts fresh |
| --- | --- |
| The clans, their names and any AI seat (the game creator can change the number of clans: see [CLANS.md](CLANS.md)) | The map: links and homeworlds |
| Each clan's private channel | Treasury, materials, colonies, fleets |
| The record of past seasons (last 50) | Orders, reports, intelligence, ship packages |
| The campaign's rule choices (economy, combat, logistics) | Turn counter and deadline |

Player accounts and clan membership are separate from the campaign and are not affected.

## How maps vary

Every season uses the same 24 real stars, in their real positions. A **map seed** changes two things:

- **Links.** Each pair's distance is stretched or shrunk a little before the nearest-neighbour routes are built,
  so routes still follow real proximity but differ from season to season.
- **Homeworlds.** Chosen from pairs that are at least 3 jumps apart and the most evenly matched: the same number
  of neighbouring systems (within one), and a similar amount of territory nearer to each clan.

A seed always produces the same map. Seed `0` is the original fixed layout that existing saves were created from;
it is never changed. A new hosted campaign and every later season get a random seed.

Measured over seeds 1 to 300: 190 distinct homeworld pairs, every one of the 24 systems used as a homeworld, and
300 distinct link layouts. These are structural measures only; no games have been played to test balance.

## Existing campaigns

A save from before seasons existed loads as season 1 with no history and is otherwise unchanged. The running
family playtest is not touched by this work. If a campaign on the original fictional map is later continued into
a new season, that season uses the real-star map.

## Owner decisions (2026-11-26)

- Nothing is earned from one season to the next; the record is enough.
- The winning condition is configured by the game creator.

- A season that reaches its turn limit goes to the clan with more colonies, then more collectors, otherwise it is
  shared. Confirmed by the owner on 2026-11-27.
