# Counter-combat laboratory and opt-in preview

`tools/Deepfield.CombatLab` exercises the shared deterministic model in `src/Deepfield.Engine/Combat`. Only explicitly opted-in new typed campaigns use this model; existing generic campaigns retain their combat rules. Scouts remain noncombat reconnaissance assets. See TYPED_FLEETS.md for activation and compatibility.

| Candidate hull | Provisional cost | Counters | Countered by |
|---|---:|---|---|
| Interceptor | 5 | Bomber, Torpedo boat | Cruiser, Disruptor |
| Torpedo boat | 10 | Cruiser, Disruptor | Interceptor, Bomber |
| Cruiser | 15 | Interceptor, Bomber | Torpedo boat, Disruptor |
| Bomber | 12 | Disruptor, Torpedo boat | Interceptor, Cruiser |
| Disruptor | 8 | Cruiser, Interceptor | Torpedo boat, Bomber |

Every hull has two strengths and two counters; no best universal hull. Roles and names are original generic concepts, with no franchise assets. Costs fit a 15-credit baseline colony income; they are not final balance.

The revised candidate uses an exact maximum-value simultaneous salvo. Each ship can destroy one same-class hull or one hull it counters. Integer minimum-cost flow selects targets to maximize the credit value destroyed. Both salvos use the opening fleets. Afterward the side with less surviving credit value is routed and loses its remaining ships; equal values mutually destroy. This decisive-rout abstraction is provisional, not a claim of campaign balance.

Reinforcement cannot reduce total own surviving credit value: adding attackers cannot reduce their optimal damage; adding targets can increase opposing optimal damage by at most the added targets' value. Thus own remaining value cannot decrease, enemy remaining value cannot increase, and the rout comparison preserves that ordering. Individual hull-class survivors need not be monotone. Costs and the two-counter matrix are unchanged.

Run `dotnet run --project tools/Deepfield.CombatLab`. The suite checks 59,049 mirrored composition pairs, 295,245 one-hull reinforcement cases, the reviewer's 8-interceptor versus 10-torpedo fixture with an added cruiser at four scales, 2,000 larger mixed reinforcements, input immutability, survivor bounds, maximum counts and every directed equal-budget matchup.
Typed integration now includes migration-preserving fleets and orders, private dated composition, filtered AI decisions and a fleet-selection modal. Multi-turn balance tuning remains open. Collector shading and the custom clan designer remain deferred.
