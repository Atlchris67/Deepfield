# Seasons

A campaign is played as a sequence of **seasons**. A season is one game on one map, from two homeworlds to a
victory. When it is decided, the campaign owner starts the next season on a new map.

## How a season ends

A season is decided when a clan holds 4 colonies and 8 collectors at the end of a turn. Two clans reaching that
in the same turn share the victory. No further turns resolve and no more orders are accepted.

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
| The two clans, their names and any AI seat | The map: links and homeworlds |
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

## Open questions for the owner

- Should anything be earned from one season to the next (titles, a small head start), or is the record enough?
- Should a season have a time limit, so it lasts "a few weeks" even if nobody reaches the victory condition?
