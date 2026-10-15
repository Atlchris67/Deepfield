# Development after the first playtest

The running playtest and its save remain untouched. Development uses a separate worktree, test saves and loopback port 5097. No merge or deployment is part of these increments.

## Increment 1: scouts and shared ISR

- Existing 5-credit combat/colony ships retain their behavior. Dedicated scouts cost 3 credits, are unarmed, cannot colonize or participate in ordinary fleet movement, and fly one-turn round trips from owned colonies to adjacent charted systems. Build first, fly on a later turn. One scout per mission; grounded scouts are lost when their colony falls.
- Distant / close / deep mission return targets start at 90 / 65 / 35 percent. These are explicit tunable campaign settings, not final balance. They currently do not depend on hidden defenses; UI risk estimates are the same public settings the engine uses.
- All missions observe the simultaneous-arrival snapshot before combat. Distant returns reveal contact/ownership; close returns add estimated combat-fleet bands; deep returns add exact combat ships, scouts and collectors. A destroyed scout transmits only a positive contact signal if it encountered one, otherwise unconfirmed contact. Full reports require escape.
- Stable versioned HMAC-SHA256 sampling uses separately persisted private 256-bit game entropy plus campaign seed, turn, clan, route, mission and same-route occurrence. Public map seeds cannot predict outcomes. Request IDs, submission retries, unrelated order placement and wall-clock resolution time do not influence outcomes. Seeds stay server-side.
- Intelligence is per-clan, persisted, stamped with turn/time/phase and explicitly historical. It is never substituted for live vision. Keep 200 reports; no historical intel is fabricated during migration.
- Schema 1 to 2 is additive. Existing ships, pending orders, receipt payloads, turn/deadline and messages remain intact. Null mission fields are omitted from order serialization so existing retry receipts keep matching. Unknown schemas fail closed. Test migration on fixtures/copies only; never point the new binary at the running playtest save.

## Next bounded increments

Economy/defense implementation is isolated on `feature/economy-defenses`, stacked after the scout review branch. Schema 3 accepts schema 1/2 saves and retains `EconomyVersion=0` unless a new campaign is explicitly created with version 1. Version 1 uses collector income bonuses 3/2/1 per colony (then zero), defense cost 8 per 2 strength, cap 6, permanent attrition and no regeneration. Tests cover 1,575 mirrored fleet/defense cases, maximum defenses being conquered, hidden-defense privacy and legacy economy preservation. This adds no new mobile combat classes yet.

1. Extend intelligence with actual combat encounter observations, maintaining pre/post-combat distinctions and avoiding omniscient survivor reports.
2. Add an explicitly versioned economy/defense ruleset: collector income with diminishing returns, capped fixed defense capacity, and non-invulnerable siege paths. Preserve old campaign behavior until migration/activation is chosen. Test income snowball and maximum-defense defeat before tuning victory duration.
3. Introduce a small counter-based combat roster; every strength must have a counter. Scout information should help choose composition. Start with a documented counter matrix and deterministic symmetric simulation before introducing production ship types. Keep generic existing ships compatible.

Collector-shading blockades and the custom clan ship designer ("phase 42") are deferred. No custom hull designer, economy overhaul or unreviewed combat replacement belongs in the scout increment.

## Counter simulation checkpoint

`feature/combat-counter-lab` adds a separate console simulator, not a production engine reference. The five-hull matrix and exact deterministic candidate combat are described in [COUNTER_LAB.md](COUNTER_LAB.md). Its executable suite passes 177,199 assertions over 59,049 mirrored fleet pairs and every directed equal-budget matchup. This does not prove campaign balance or authorize replacing existing combat; typed fleet persistence, migration, scout composition, AI decisions, UI orders and siege interactions remain the next integration increment.
Private entropy is generated once for new campaigns. Legacy saves receive it under the store lock/transaction and commit that migration before executing a requested operation, so a failed first operation cannot reroll it. Read-only initialization also persists it. No API/report DTO exposes the entropy. Pure replay fixtures supply fixed test-only entropy; production campaign creation uses cryptographic randomness. This is gameplay state, not an authentication credential.
