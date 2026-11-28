# Clans and alliances

A season has **two, three or four clans**. The game creator chooses the number for each season. These rules were
decided by the owner on 2026-11-28. A two-clan season plays exactly as it always has, and has no alliances.

## Choosing the number of clans

- The game creator picks 2, 3 or 4 in the season dialog, when starting the next season or before the current
  season's first turn resolves. A new hosted campaign starts with the `Clans` setting, or 2.
- Three or four clans need simple or advanced mode, which always use the 24-system real-star map.
- A clan that stays in the campaign keeps its name and its channel. A new clan gets a default name
  (Tidal Concord, Verdant League). A season cannot leave out a clan while a player belongs to it or holds an open
  invitation to it: the owner moves those players first.
- Every clan starts the same way: one full homeworld, eight ships, 60 credits.

### Homeworlds for three or four clans

Homeworlds are chosen from the map's 24 systems by a fixed, seeded method:

1. No two homeworlds are neighbours.
2. Among all possible sets, keep those whose closest pair is as far apart as the map allows, or one jump less.
3. Of those, keep the most even sets. Evenness compares, for each homeworld, the systems one and two jumps away
   and the systems that are nearer to it than to any other homeworld.
4. The season's map seed picks one of those sets and decides which clan gets which homeworld.

On the 120 test maps the closest homeworlds are two jumps apart. Two-clan maps are unchanged.

## Battles with more than two clans

Clans that are not allied fight whenever their fleets are in the same system at the end of a turn.

- Each clan divides its force evenly between the hostile clans present. An odd ship goes against the strongest; between equally strong clans the choice rotates from turn to turn.
- Every pair fights at the same moment. In simple mode each pair loses equally. In advanced mode each pair is
  decided by the usual ship-type battle.
- The rounds repeat until no two hostile clans are left in the system.
- A colony's fixed defenses fight beside its owner, as before, and are lost first.
- Then a surviving fleet takes the colony of a clan it is not allied with, or founds a colony in an empty system.
- With only two clans present the battle is exactly the two-clan battle.

Example: 8 ships meet two fleets of 3. The 8 split 4 and 4. Each 3 splits 2 against the big fleet and 1 against
the other small fleet. After two rounds the big fleet has 4 ships left and the others none.

A scout's report on "other clans" adds up every clan that is not its own clan's ally.

## Alliances

Alliances exist only with three or four clans. An alliance is between two clans. An ally's ally is not an ally.

| Question | Rule |
| --- | --- |
| Forming | One clan offers; the other accepts. The alliance starts with the next turn. An offer can be declined or withdrawn. |
| Ending | Either clan gives notice. The alliance still holds for this turn and the next, so an ally is never attacked by surprise. A new alliance between the same two clans can be offered once it has ended. |
| What allies share | Peace and sight. Allied fleets do not fight each other and cannot take each other's colonies. Each ally sees every system the other sees and has charted. |
| What stays separate | Credits, materials, ships, orders, scout reports, the clan channel, and a colony's private figures (stockpile, growth, habitability). |
| Who knows | Every clan can see who is allied, and gets a report when an alliance is agreed, given notice or ended. An offer is seen only by the two clans involved. |
| Winning | The winning condition stays per clan. When a clan wins, the clans allied with it at that moment share the win. At a turn limit, the clans with the most colonies (then collectors) win, with their allies; clans that are exactly level share it. |
| The computer | A clan played by the computer never offers or accepts an alliance. When the owner hands a clan to the computer, its unanswered offers are dropped; an alliance already agreed stands. |

Allies in the same empty system do not fight, so each can try to found the colony. The clan earlier in the clan
list founds it.

## For developers

- Rules: `src/Deepfield.Engine/Alliances.cs` (pacts and offers), `Battles.cs` (battles for any number of clans),
  `RealStarMap.Generate(seed, players)` (homeworlds), `Seasons.StartNext` and `Seasons.SetMode` (`clans` option).
- `Game.Pacts`, `Clan.AllianceOffers`, `Game.Winners`. `Game.Winner` is still one clan's index, or the number of
  clans for a shared win (2 in a two-clan campaign, as before); `Winners` names every winner.
- API: `POST /api/alliances` with `{ "action": "offer" | "decline" | "end", "clan": 1 }`. `POST /api/admin/season`
  and `POST /api/admin/mode` take `clans`. The campaign view carries `pacts`, `allies`, `allianceOffersMade`,
  `allianceOffersReceived` and `winners`.
- Clan keys (local development): `Teams__2__Key` and `Teams__3__Key` are optional and work only while the campaign
  has a third or fourth clan.
- Saves: two-clan saves load unchanged. A save is rejected if its fleet lists do not match its number of clans or
  it contains an impossible alliance.
- Checks: `tests/Deepfield.Checks/ClanChecks.cs` (run alone with `--clans`) and `web/tests/clans-api.mjs`
  (`npm run test:clans`).
