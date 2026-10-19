# Star map generation — slice 1

This slice defines the deterministic server-side map contract. It does not change the current campaign, replace its twelve-system layout, or add Spacekit to the browser.

## Persisted contract

`StarMapGenerator.Generate(seed, settings)` returns a complete `GeneratedStarMap` containing:

- generator version and seed;
- the exact generation settings;
- stable system IDs, original names and integer coordinates;
- normalized, deduplicated links with a guaranteed connected graph;
- one unique homeworld assignment per player slot.

Persist the complete generated snapshot with a campaign. The seed and generator version record provenance; loaders must not regenerate an existing campaign because a later generator version could produce different coordinates or links.

Generation uses a repository-owned SplitMix64 sequence instead of `System.Random`, so a runtime implementation change cannot silently alter a campaign map. Invalid or physically impossible settings fail without returning a partial map.

## Current boundaries

- The live `Rules.Create` path remains unchanged.
- Links are map topology for preview and current adjacency-style rules. A later movement slice will decide whether normal flight uses these as hard lanes or continuous distance; Spacekit must not make that rules decision.
- Homeworld selection uses deterministic farthest-point placement. Fairness scoring, rerolls and host-facing validation belong to a later slice.
- System names are original Deepfield names. Additional systems receive deterministic `Deepfield NNN` names.
- Wormholes, stargates, travel time, fog-of-war rendering and Spacekit interaction are not included.

## Verification

`StarMapChecks` covers an exact version-1 seed fixture, replay, seed variation, coordinate bounds, minimum separation, link normalization, graph connectivity, unique homeworlds, JSON persistence and invalid/impossible configuration rejection.
