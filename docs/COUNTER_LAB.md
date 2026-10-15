# Counter-combat laboratory (not campaign rules)

`tools/Deepfield.CombatLab` is a standalone deterministic simulator and executable acceptance suite. It has no reference from the API or live engine; no save migration, new build orders or player ship changes occur. Scouts remain noncombat reconnaissance assets. This is the next tested development increment before differentiated combat hulls are wired into production rules.

| Candidate hull | Provisional cost | Counters | Countered by |
|---|---:|---|---|
| Interceptor | 5 | Bomber, Torpedo boat | Cruiser, Disruptor |
| Torpedo boat | 10 | Cruiser, Disruptor | Interceptor, Bomber |
| Cruiser | 15 | Interceptor, Bomber | Torpedo boat, Disruptor |
| Bomber | 12 | Disruptor, Torpedo boat | Interceptor, Cruiser |
| Disruptor | 8 | Cruiser, Interceptor | Torpedo boat, Bomber |

Every hull has two strengths and two counters; no best universal hull. Roles and names are original generic concepts, with no franchise assets. Costs fit a 15-credit baseline colony income; they are not final balance.

The candidate model normalizes neutral power by credit cost so tests compare equal investment. Pairwise matchup factors are 3 favorable / 2 same-class / 1 unfavorable, weighted by the actual opposing composition rather than an exploitable “one counter ship enables a whole-fleet bonus” flag. Exact integer arithmetic compares both sides simultaneously. The weaker force is destroyed; surviving-side losses scale with opposing effective strength. Cheapest hulls screen first, with explicit whole-hull rounding. This casualty policy is provisional and must be reviewed before campaign integration.

Run `dotnet run --project tools/Deepfield.CombatLab`. The suite exhausts 59,049 composition pairs, checks mirror symmetry, input immutability, valid survivor bounds, overflow protection and every equal-budget matchup at 120 credits.

Next integration work: migration-preserving typed fleets and orders; private deep-scout composition fields; AI choosing counters from its own dated intelligence; a clear fleet-composition editor; defense/siege interactions and multi-turn balance simulations. Do not add production hulls merely because isolated matchup tests pass. Collector shading and the custom clan designer remain deferred.
