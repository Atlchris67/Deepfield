# Verification — 2026-10-14, Piedmont

## Standalone counter-combat lab — 2026-10-15

`dotnet run --project tools/Deepfield.CombatLab --disable-build-servers` passed **177,199 assertions**, exhaustively comparing **59,049 mirrored composition pairs** and all **20 directed equal-budget matchups**. Checked input immutability, survivor bounds, maximum-size arithmetic and malformed counts. The project is built by the solution but not referenced by the API/engine; it changes no campaign or save behavior. No browser rerun is needed for this console-only increment; the 34-check UI suite from the preceding commit remains the latest app evidence.

## Opt-in economy/defense increment — 2026-10-15

- C# build passed, zero warnings/errors. 43 baseline + 27 reconnaissance + 14 economy/defense checks passed (84 total).
- Defense verification includes 1,575 mirrored fleet/defense cases, permanent damage, aggregate cap enforcement, conquest of maximum defenses, and no hidden-defense influence on views/AI.
- Collector income cap and exact costs are verified. Schema-2 migration preserves economy version 0, zero initial defenses, and deadlines; all old receipt/scout checks still pass.
- 34 API/browser checks passed, including a separate fresh version-1 save with actual collector/defense build orders, income/cost assertions and API fog-of-war. Legacy and preview saves remain distinct. TypeScript checks and production frontend build pass.
- Only isolated test port 5097 and disposable saves were used. No current playtest changes. PostgreSQL integration remains untested without a disposable server.

## Scout increment — 2026-10-15

Isolated checkout `Deepfield-scouts`, branch `feature/scout-isr`; no running-playtest files, processes, keys or save were changed.

- C# build passed with zero warnings/errors; all 43 prior engine/persistence checks plus 27 reconnaissance/migration checks passed.
- 31 live API/browser checks passed on port 5097, including scout construction, a server-committed mission with its response deliberately dropped, safe retry, historical report rendering/aging, and cross-clan UI/data isolation.
- TypeScript build/unused checks and Vite production build passed. Mobile intelligence screenshot inspected (`test-results/scout-intelligence-mobile.png`). The browser fixture deliberately uses 100% return rates for its full-report scenario; engine fixtures separately verify 90/65/35 defaults and deterministic destruction for every tier.
- Paired hidden-state fixtures produce equal views, estimates, legal mission validation and AI plans. Request IDs, order permutations, unrelated orders and resolution wall-clock changes cannot reroll mission outcomes.
- Schema-1 fixture migration preserves pending orders/receipt comparisons, fleet counts and deadline, invents no historical intelligence, and commits through the file store. Reconnaissance loss/report persistence is verified across reopening and duplicate resolution.
- PostgreSQL integration remains unexecuted without a disposable server. No merge or deployment.

## Independent-review fixes

All three P2 findings have regression coverage:

- Clan logout remounts the entire command session, clearing private unsent messages, call sign, key, drafts, editor values, notices/errors and pending requests. An old session's async callbacks cannot repopulate the new session.
- Definitive order rejection clears the pending receipt while preserving the editable draft. Ambiguous network/server failures retain the exact request. The browser regression commits an order on the server and deliberately drops its response, then verifies the retry keeps the identical payload/ID and does not increment revision again.
- AI expeditions are capped at the human limit of 100 ships per order. A 102-ship fixture validates and resolves across three turns; file-store reopen/retry checks verify each turn commits exactly once.

Post-fix full verification: **43 engine/file-persistence checks and 26 live API/browser checks passed**, C# build zero warnings/errors, strict TypeScript checks and Vite production build passed. PostgreSQL integration remains skipped because no disposable server is configured. These totals supersede the original baseline counts below.

A copy of the independent reviewer's harness was also rerun against the fixed projects without modifying the review checkout: **225 mirrored combat cases passed**, malformed extreme orders left state unchanged, the large-AI persisted campaign reached turn 3, and **24 competing resolution attempts across two processes produced exactly one commit** (`commits=1` / `commits=0`, both reporting turn 2). Local recheck artifacts are under ignored `test-results/reviewer-recheck/`.

## Verified

- Windows host PIEDMONT; .NET SDK 10.0.400, Node 22.23.2, npm 10.9.8.
- `dotnet build --no-restore -m:1 --disable-build-servers`: successful, zero warnings/errors.
- `dotnet run --project tests/Deepfield.Checks --no-build`: **33 checks passed**. Includes seeded reproducibility, deterministic replay, hidden state, legal AI and AI victory, order resource constraints, stale revisions, exact deadline, identical/mismatched retries, movement/colonization/combat, victory/draw, outage pacing, persisted receipts, failed-write rollback, and twelve competing file-store resolvers committing exactly one turn.
- `npm run build`: TypeScript plus Vite production build successful; generated static UI is intentionally ignored by Git and reproducible from lockfile.
- `npm run lint`: strict TypeScript unused-symbol/parameter checks successful (not an ESLint audit).
- `node tests/smoke.mjs`: **19 checks passed** using actual ASP.NET processes and installed Edge. Includes HTTP auth/visibility, private board isolation, persisted orders across process exit/start, idempotency/conflicts, eight concurrent test-resolution requests, overdue restart scheduling, second restart protection, browser collector submission, board message and turn resolution, mobile overflow, uncaught browser error detection, forwarding/public-host guards, explicit test-mode opt-in and Production refusal of the development store.
- Desktop (1440px) and mobile (390px) screenshots captured and visually inspected. Artifacts remain local under ignored `test-results/command-desktop.png` and `command-mobile.png`.
- npm dependency audit after upgrading Vite to 7.3.7: zero reported vulnerabilities.

## Corrections found during verification

- API campaign GET initially selected a RequestDelegate overload and returned an empty 200 response. Explicit store injection selected the correct route handler; HTTP and browser tests now cover this.
- Fetch normalizes Host in the test runtime. The public-host guard test now uses a raw HTTP request so it actually tests a non-loopback Host header.
- Initial unprivileged GitHub auth/network probes gave misleading errors; authorized network execution verified working GitHub authentication. No credentials were changed.

## Untested / bounded claims

- **PostgreSQL runtime integration skipped.** Npgsql restores and the adapter compiles, but no PostgreSQL executable, running process, connection or Docker runtime was available. Set `DEEPFIELD_TEST_POSTGRES` to a disposable empty database and rerun the C# suite before choosing hosted persistence.
- Filesystem mutation tests required approved execution outside the restrictive sandbox; the same suite then passed. This is not proof of power-loss durability on every filesystem. No destructive power-failure test was performed.
- In-app browser initialization failed with a missing Windows runtime directory; installed Edge via Playwright supplied the verified browser path. No browser/runtime installation was performed.
- A real 24-hour wall-clock wait was not performed. Boundary/overdue cases use fixed engine clocks or a controlled test-save deadline; the real hosted worker was exercised during restart tests.
- No full accessibility audit, adversarial penetration test, multiplayer play-balance session or hosted Cloudflare/proxy test. There are only shared team keys, not individual identities or invitations.
- No deployment, DNS, firewall, tunnel, persistent service, external agent or account changes. Test servers are stopped by the smoke harness. No license chosen.

## Publication

The authorized destination is `https://github.com/Atlchris67/Deepfield`, initially empty. Work is committed in small checkpoints on `feature/deepfield-mvp`. A draft PR requires a separate agreed base branch; no `main` branch or license is silently initialized and no merge is performed.

## Review fix: unpredictable reconnaissance — 2026-10-15

75 engine/persistence checks (43 baseline + 32 reconnaissance) and 32 API/browser checks pass. Added paired-public-state/private-entropy checks, reconstruction attempts for six public route/tier inputs, response privacy, migration reopening and failed-first-operation retry stability. C# build has zero warnings/errors; TypeScript checks and frontend build pass. PostgreSQL migration code compiles but remains untested against a server. No live playtest changes.


## Targeted review corrections
Private reconnaissance entropy: scout branch 75 engine/store checks and 32 API/browser assertions; economy stack 89 checks and 35 API/browser assertions. Both built without warnings and passed frontend build/lint. PostgreSQL runtime remains untested.
Counter correction: 474,448 assertions passed, including 295,245 one-hull reinforcement comparisons, four scales of the reported regression, and 2,000 larger mixed fleets. The model now uses simultaneous maximum-value salvos and decisive rout; campaign balance is not established.


## Typed fleet UI checkpoint
Engine/store suite: 114 passing checks (43 baseline, 32 reconnaissance, 14 economy, 25 typed fleet). Counter simulator: 474,448 assertions, including outcome-rank monotonicity in 295,245 reinforcement comparisons. Frontend build and lint pass. Isolated API/Edge suite: 64 passing assertions on port 5097, covering exact 8/10 and 3+6 rejection, same-turn builds, cancellation/back/Escape/in-flight cancellation, repeated clicks, stale inventory/revision, source changes, per-class inventory, clan cleanup, collectors, mixed combat, private reports and restart.
Desktop and mobile modal screenshots inspected. Screenshots: test-results/expedition-modal-desktop.png, expedition-modal-mobile.png, typed-fleet-desktop.png and typed-fleet-mobile.png. These ignored artifacts contain isolated test campaigns only. PostgreSQL integration remains skipped; live port 5080 untouched.

The final stack also includes the PostgreSQL single-connection migration fix and optional MaxPoolSize=1 regression fixture; see POSTGRES_MIGRATION.md. This path compiles but remains runtime-unverified without PostgreSQL.

### Final merged-head limitation
The final typed-fleet stack, including the PostgreSQL pool fix, builds with zero warnings/errors and passes frontend build/lint. Windows Application Control then blocked loading the newly built Deepfield.Api.dll (0x800711C7), both in the executable checks and isolated API startup. One unchanged retry was also blocked. Security policy was not modified.

The 114 engine checks and 64 API/browser assertions above are successful prior runs, not a claim that this final merged head completed runtime verification. The scout branch containing the PostgreSQL fix separately built and passed its 75 file/rule checks. The final small modal scroll-container adjustment has build/lint validation only. PostgreSQL runtime validation still needs a disposable server independently of the Windows execution block. Re-run the complete checks and browser suite after the host permits the new assembly to load.

Source-only P3 follow-up: battle reports now render null scout and collector counts as Unknown, while observed zero values remain zero. Two browser regression assertions were added for battle unknowns and deep-scout zero counts. These new assertions have not been run; Deepfield execution remains paused under the documented Windows Application Control block. Prior successful counts remain historical.

## Independent fleet-selector verification

The fleet-selector validation module can be checked without the API or .NET runtime:

```powershell
npm.cmd run test:fleet --prefix web
Push-Location web
npm.cmd run test:fleet-ui
Pop-Location
```

The pure checks transpile only the standalone TypeScript validation module and exercise inventory, hull allocations, destinations, numeric inputs and order-slot limits. The component checks serve a synthetic React fixture through a temporary loopback Vite server and drive installed Edge. They never start .NET, contact the campaign API, read keys, access saves or touch port 5080. Fixture state exists only in the test page. Both server and browser close afterward.

This increment passed 34 pure validation checks, 12 synthetic browser component checks, frontend lint/build and diff whitespace checks. The component checks cover exact shortage/exhaustion/order-limit messages, repeated clicks, cancel during pending confirmation, Escape, Back, source reset and aggregate reservations. Screenshot: ignored test-results/fleet-validation.png. These results do not replace full API/engine/browser integration checks, which remain paused under the documented Windows execution limitation.

## Reconnected compile and intelligence follow-up

No duplicate implementation was needed: the Unknown-count fix was already present at 5d20200. The final preview-storage correction was compiled through downstream fleet-validation head 73c00a4 using `dotnet build Deepfield.sln -m:1 --disable-build-servers`: all four projects built, zero warnings/errors, 8.27 seconds. Nine static preview wiring checks passed. No API, console-check or other Deepfield binary was executed; the eight C# policy checks and two startup regressions remain unrun.

Added `npm.cmd run test:intel-ui` (run from web): ten synthetic React/Edge intelligence checks passed, and its TypeScript fixture passed explicit strict type checking. Coverage includes battle Unknown scout/collector counts, known zeros, absent defenses/ownership, historical turn labels, lost-scout privacy, mobile overflow and clearing reports on clan replacement. The fixture uses no API, keys or saves. This does not validate backend runtime or claim full integration coverage. Existing Windows execution limitations remain in force.

## Draft submission and session race regressions

Four frontend defects were reproduced with the actual React application and synthetic intercepted API responses: two same-tick Commit events sent two PUTs; Remove remained active during refresh and the late response restored the removed order; a PUT completing after Leave initiated another old-clan GET; editing the key during a pending login displayed the first clan while subsequent orders used the second key. Synchronous action guarding, busy-state editor locks and closed-session response guards fix these cases without changing server rules.

From `web`, run `npm.cmd run test:draft-ui`. Ten synthetic Edge checks pass, covering the four regressions plus definitive rejection, ambiguous network/server failures, identical retry request IDs/payloads, failed post-submit refresh and private editor/draft clearing when switching clans. Frontend lint/build and diff whitespace checks also pass. The test starts only a temporary loopback Vite server and intercepts all API requests with in-memory fixture responses; it uses no real credentials, saves or .NET processes. Full API/engine integration remains unrun under the existing Windows execution pause. Live port 5080 is untouched.

## PR #9 recovery coverage and consolidated runtime backlog

The maintained draft/session suite now includes the four additional reviewer regressions: failed standalone refresh releases its action guard, refresh retry restores usable Commit controls, failed login unlocks the credential and submit controls, and a subsequent login selects the new clan. All 70 safe frontend checks pass on this update: 34 pure fleet validation, 12 fleet component, 10 intelligence component and 14 draft/session browser checks. Frontend lint and production build pass. No production code changed in this follow-up; the reviewer checkout was read only. The focused review and current regression runs identify no further actionable frontend defect. Broader speculative frontend work is deferred.

### Pending runtime validation (not executed)

Windows Application Control still blocks the Deepfield execution path. The commands below are a future checklist after a supported execution path is explicitly approved, not instructions to retry or bypass the current pause. Use the isolated checkout, disposable saves and process-local test credentials; preserve the existing port 5080 playtest. Confirm test ports are free and inherited storage configuration cannot select a real database or save before starting any harness.

- Rebuild the exact candidate with `dotnet build Deepfield.sln -m:1 --disable-build-servers`, then run `dotnet run --project tests/Deepfield.Checks --no-build`. Recheck deterministic rules, legal AI visibility/orders, deadline rejection, request-ID/payload retries, atomic file persistence, restart recovery, single overdue advancement and legacy migrations. This also includes the eight authored preview-storage policy checks. Historical passing counts do not verify the current candidate.
- Run `node tests/preview-startup.mjs` from the root: two authored process-startup regressions must reject conflicting database/save configuration before store use and preserve the sentinel save. Neither case has run under the current pause.
- Run `node tests/smoke.mjs` from `web` against its disposable API campaign on port 5097. Revalidate real API authorization, private boards/intelligence, legal orders and deadline/revision behavior, accelerated-mode restrictions, typed expeditions, settlement/build timing, combat reports, UI interactions and persistence after restart. Inspect generated desktop/mobile evidence. The synthetic frontend suites cannot prove these server behaviors.
- Run `dotnet run --project tools/Deepfield.CombatLab --no-build` for the current candidate. Prior 474,448 passing assertions are historical; retain outcome-rank, reinforcement and mixed-fleet checks when validating this build.
- PostgreSQL remains a separate unavailable dependency. Once a disposable test server is available, set `DEEPFIELD_TEST_POSTGRES` only to that test database and rerun the executable checks. Verify transaction concurrency/restart/idempotency and the single-slot pool migration fixture, including persisted entropy after the first operation fails. See POSTGRES_MIGRATION.md. Never use the live campaign database.
- Optional IDE validation remains unperformed: no compatible Visual Studio IDE was found. If one is installed separately and execution is approved, verify solution loading/build and the isolated-preview profile on port 5098, including fresh temporary storage on each launch. See VISUAL_STUDIO.md. This is not required for CLI testing.

No DNS, tunnel, deployment, service, credential, signing or Windows policy changes are part of this backlog execution authorization. The optional signing workflow is a separate draft branch and is not required or selected by this update.
