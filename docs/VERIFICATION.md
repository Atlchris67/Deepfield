# Verification — 2026-10-14, Piedmont

## Inhabitants, and tidy up for 1.0 (milestone 8) - 2026-11-27

Branch `feature/tidy-1.0`, from `main`. No deployment. The running playtest, its keys and its save were not touched.

Owner decisions recorded: habitability always affects the growth rate of a colony's inhabitants; inhabitants drive colony income; the turn-limit tie-break is confirmed as built. The rule and its numbers are in [MODES.md](MODES.md).

Verified by CI on this branch (Linux, .NET 10, Microsoft Edge, throwaway PostgreSQL 16):

- `Deepfield.Checks` with PostgreSQL: **370 checks passed** (346 before, plus 24 inhabitant checks). The real-campaign checks passed 40 more times.
- The 24 inhabitant checks cover, in both modes: the growth and income numbers; homeworlds starting full with the opening income unchanged; a colony founded with 20 inhabitants earning 7 credits; a kind world growing by 15 a turn and a harsh one by 3; what a clan is and is not shown; saving and loading; the limit of 100; a fallen colony starting again from 20; invalid saves being rejected; a save from before inhabitants loading unchanged and still paying 15 per colony; its next season starting with inhabitants; and the computer player choosing by its scouts' reports and not by the hidden score.
- Two mode checks were updated, because a newly founded colony now earns 7 credits and not 15.
- Every web and browser suite passed with unchanged counts, except the desktop suite, which has one new check per mode (58): a colony's inhabitants, growth and habitability are shown, and the income line explains the rule.
- The computer player still finishes a season on every test map in both modes.
- The container image builds and starts.

Not verified:

- Balance with people playing. The numbers (20 at founding, 3 to 15 a turn, 5 to 15 credits) are a first setting.
- The browser suites were run by CI only. The development machine's Application Control policy blocked the newly built server, and that policy was left alone. The rules checks ran on the development machine before the last small change and in CI after it.
- No screenshot review of the new Inhabitants line by a person.

## Continuous integration and merge to main (milestone 7) - 2026-11-27

Branch `feature/ci`, stacked on `feature/desktop-polish`, with `feature/merge-signing` on top. No deployment. The running playtest, its keys and its save were not touched.

`.github/workflows/ci.yml` runs on every pull request, on every push to `main`, and on request. It never deploys and never publishes anything. On a GitHub Linux runner with .NET 10, Node 22, Microsoft Edge and a throwaway PostgreSQL 16:

- `npm ci`, then the TypeScript check including unused code.
- `dotnet build Deepfield.sln --warnaserror`: no warnings.
- `Deepfield.Checks` with PostgreSQL: **346 checks passed**. No retry.
- The real-campaign checks 40 more times with fresh random deposits: all passed (see the fix below).
- Every web and browser suite: fleet-selection 39, fleet-component 12, intel-component 10, draft-session 29, draft-editing 25, draft-edit-ui 45, planet-component 28, star-map-component 13, real-sky-rotation-component 25, material-reservations 19, real-sky-projection, system-panel-component, planet-scale, real-campaign-api 14, generated-campaign-api 22, smoke 73, **accounts 37** (including the hosted configuration against PostgreSQL), seasons 45, desktop 56, planet-api 14.
- A second job builds the container image from the `Dockerfile`, starts it in Production mode against a throwaway PostgreSQL, and requires its health check to answer and the web app to be served. This is the first time the image has been built.

What the first runs on Linux found, all fixed:

- The planet component suite read a fixtures file that existed only on the development machine. CI now has the planet checks write it during the run (`DEEPFIELD_PLANET_FIXTURES`).
- The smoke suite waited forever after a server that ended by a signal instead of an exit code, which is how a crash ends on Linux. Five suites now treat both as stopped.
- The hosted account checks expect a campaign with no owner and were sharing a database the rules checks had already used. They get their own empty database.
- With Linux fonts the system-panel tabs did not fit a 1280-pixel window. They now move to a second line instead of being cut off, with any font.
- A machine with no graphics card logs a notice that a screenshot of the 3D sky was slow. The desktop suite ignores that one notice.
- **The older check that failed by chance is fixed.** `RealCampaignChecks` compared a campaign with the new material balance against one with the original balance, each with different random deposits, and required more Ferrite and more Neralite. Giving both the same deposits did not make it reliable (4 failures in 60 runs): with the original balance a home planet can by luck be all Neralite, which gives more Neralite than the new balance and no Ferrite at all. The check now gives both campaigns the same deposits and requires the scarcer of the two supplies to be better, which is what the new balance guarantees. A `--real-campaign` flag runs just these checks.

Merge:

- The owner chose to fast-forward `main` to the tip of the stack and to make `main` the default branch (2026-11-27). `main` had one commit and nothing to conflict, so no history is rewritten and nothing is force-pushed.
- Pull request #6 (optional signing workflow) is merged into the stack on `feature/merge-signing`. Two conflicts (`.gitignore`, `README.md`) were resolved by keeping both sides. `tests/signing-checks.ps1`: 23 checks pass on Windows. Nothing is signed unless someone runs the script with a certificate.
- Not included: #12 (rotatable planet previews) and #14 (star-map setup preview), because the stack already contains later versions of both features; and #15 (richer starfield), because it draws behind the flat sector map that the 3D sky replaced. They remain open and untouched.

Not verified:

- The signing checks are not part of CI; they are PowerShell written for Windows and were run by hand.
- After the last change to the material check, the rules checks were run by CI only. The development machine's Application Control policy blocked the rebuilt checks program, and that policy was left alone.
- The container image has not been run on any hosting platform, only inside CI.
- CI uses Microsoft Edge on Linux only. No other browser, and no Windows runner.

## Desktop polish (milestone 6) - 2026-11-26

Branch `feature/desktop-polish`, stacked on `feature/fill-in-ai`. Browser changes only; no rule, save format or server change. No deployment. The running playtest, its keys and its save were not touched.

How it was done: a hosted campaign was started in each mode, the computer played four turns for the owner's clan so the screens had colonies, reports and intelligence on them, and the command deck and its dialogs were measured and screenshotted in Microsoft Edge at 1280×720, 1440×900 and 1920×1080.

Found and fixed:

- The sky started on the clan's own colony while the materials, logistics and order panels started on system 0, so the page described two different systems. Every panel now starts on the clan's first colony, and starts there again in a new season or a new game.
- Star names overlapped in the middle of the sky. A name that would cover a more important one (selected, then own, enemy, scouted, unknown) is hidden until its star is pointed at or reached with the keyboard.
- The sky left a blank block beneath it, beside the taller system panel. It now fills that height, up to the height of the window.
- 19 style rules set text at 9 or 10 pixels. The smallest text is now 11 pixels.
- Closing the Players or Season dialog left keyboard focus nowhere. It now returns to the button that opened the dialog, as the planner already did.
- At 1280 pixels wide the "Defenses" tab of the system panel was cut off and "Reset orbit" wrapped onto two lines. Both now fit on one line.
- The "Colonization planner" and "Season" buttons looked unlike the section links beside them, and the planner heading was indented further than the rest of its dialog. Both are aligned.

New suite `npm run test:desktop` (`web/tests/desktop.mjs`): **56 checks**, 28 in each mode, with a real server and Microsoft Edge:

- the owner setup screen fits, with no text under 11 pixels and every control named;
- at each of the three sizes: no sideways scrolling and nothing off the edge; no text under 11 pixels and every control named; the sky sits beside the system panel and fills its height; the system tabs and orbit controls are fully visible, none cut off or broken inside a button; no star name covers another; the sky, the system panel and (in advanced mode) the logistics panel start on the same system;
- a star whose name is hidden shows it on keyboard focus, and choosing it with the keyboard selects it;
- the Players, Season and Colonization planner dialogs open from the keyboard, fit the window, and Escape closes each and returns focus to its button;
- the browser console shows no errors or warnings, with one exception listed below.

Everything else, run against the current Debug build with `DEEPFIELD_TEST_API_DLL` and `DEEPFIELD_TEST_WEBROOT` set:

- `dotnet build Deepfield.sln --no-incremental`: 0 warnings, 0 errors.
- `Deepfield.Checks` with `DEEPFIELD_TEST_POSTGRES` set: every group passed. No check was added or changed, so the total is the 346 of milestone 5.
- Unchanged and passing: fleet-selection 39, fleet-component 12, intel-component 10, draft-session 29, draft-editing 25, draft-edit-ui 45, planet-component 28, star-map-component 13, real-sky-rotation-component 25, material-reservations 19, real-sky-projection, system-panel-component, planet-scale, planet-api 14, real-campaign-api 14, generated-campaign-api 22, smoke 73, accounts 30, seasons 45.

Known and left as it is:

- The orbit view logs `Object id is not unique: "planet-…"` in the console. Spacekit 0.1.1 registers a sphere that has an orbit twice; nothing is wrong on screen. The desktop suite allows exactly this message and fails on any other.
- The component suites other than system-panel, real-sky-rotation and planet-component were run before the last style-only change (the 1280 tab fix); those three, smoke and the desktop suite were rerun after it.

Not verified:

- Browsers other than Microsoft Edge, and windows narrower than 1280 pixels. Phones and tablets are out of scope for now (owner decision: computer first).
- Display scaling other than 100%, and a screen reader. Control names and keyboard reach were checked by measurement, not by listening.
- The dialogs for a single planet, an expedition and editing an order, and the star-map setup dialog, were not part of the desktop measurements; their own suites still pass.
- A campaign with the older fictional map was not part of the desktop measurements. The starting-system fix applies there too, and the existing suites still pass.
- The accounts suite with the hosted PostgreSQL configuration was not rerun (nothing in accounts changed besides focus return in the Players dialog).

## Computer player (milestone 5) - 2026-11-26

Branch `feature/fill-in-ai`, stacked on `feature/modes`. No deployment. The running playtest, its keys and its save were not touched; tests used throwaway saves and the same disposable embedded PostgreSQL as before.

- `dotnet build Deepfield.sln --no-incremental`: 0 warnings, 0 errors.
- `Deepfield.Checks` with `DEEPFIELD_TEST_POSTGRES` set: **346 checks passed**: the 330 from milestone 4 plus **16 computer-player checks**.
- Computer-player checks cover: two computer clans finish a season on each of 12 maps in simple mode and in advanced mode (slowest 8 turns), with every plan re-checked against the rules people are held to; expeditions are paid for before collectors; collector buying stops at the winning condition; a recently defended system is tried last and attacked only with a larger force; interior colonies forward ships; a campaign from before modes keeps the original planner; a clan of people that misses a turn gives no orders; the owner hands a clan to the computer and back, both clans are told, the players' submitted orders are kept and used if the clan is handed back before the turn resolves; the setting carries into the next season.
- `npm run test:seasons`: **45 checks** (8 new): both clans see who plays each clan; only the owner can change it; a computer-played clan refuses its players' orders with an explanation and accepts them again when handed back; in the browser the owner has one control per clan, a player sees the list without controls, and a player of a computer-played clan sees a notice that disappears when the clan is handed back.
- All other suites unchanged and passing, run against the current Debug build with `DEEPFIELD_TEST_API_DLL` and `DEEPFIELD_TEST_WEBROOT` set: fleet-selection 39, fleet-component 12, intel-component 10, draft-session 29, draft-editing 25, draft-edit-ui 45, planet-component 28, star-map-component 13, real-sky-rotation-component 25, material-reservations 19, real-sky-projection, system-panel-component, planet-scale, planet-api 14, real-campaign-api 14, generated-campaign-api 22, smoke 73, accounts 30.

Measured before the change, with the original planner on the same 12 maps for 80 turns: in simple mode 2 of 12 seasons never finished (collector purchases used all income, so no ships were built), and in advanced mode 1 of 12 never finished (both clans fed four ships a turn into the same system indefinitely).

Not verified:

- The computer against people. Every measurement is computer against computer, and an unopposed clan reaches the standard winning condition in about 8 turns, so these games say little about how it holds up against a player.
- Winning conditions other than the standard one. In advanced mode collectors need two materials that mostly exist only at the homeworld, so a high collector target may be out of the computer's reach.
- The component suites were run before a last change to the planner (movement is now planned before the remaining purchases). That change is in the engine only; the rules checks and all server-backed browser suites were rerun after it, the component suites were not.
- The accounts suite with the hosted PostgreSQL configuration was not rerun (nothing in accounts changed).
- The older `RealCampaignChecks` material check that fails by chance (see milestone 4) is unchanged and passed in these runs. (It was fixed in milestone 7.)

## Simple and advanced modes (milestone 4) - 2026-11-26

Branch `feature/modes`, stacked on `feature/seasons`. No deployment. The running playtest, its keys and its save were not touched; tests used throwaway saves under `test-results/` or the system temp folder and the same disposable embedded PostgreSQL as before.

- `dotnet build Deepfield.sln --no-incremental`: 0 warnings, 0 errors.
- `Deepfield.Checks` with `DEEPFIELD_TEST_POSTGRES` set: **330 checks passed**: the 306 from milestone 3 plus **24 mode checks**.
- Mode checks cover: what each mode turns on; simple mode has no material stock, mines, stockpiles or typed fleets and refuses defenses, mines, settlement growth, gates, freighters, hull classes and ship design; a simple-mode turn builds ships, collectors and scouts for credits alone and founds a colony; computer-played clans play simple mode for 25 turns and leave a valid save; advanced mode accepts advanced orders; unknown modes, a mode on the fictional map and industrial focus in simple mode are refused; a save whose mode does not match its rules is rejected; a campaign from before modes has no mode and keeps its rules into later seasons; the mode is kept or changed across seasons; before the first turn the mode can be changed on the same map, keeping season, deadline, winning condition, history, channels and AI seats.
- `npm run test:seasons`: **37 checks** (6 new): a hosted campaign starts in simple mode; only the owner can change the mode; switching to advanced and back before the first turn; a player sees the mode but cannot edit it; the command deck offers no defenses or mines in simple mode; the owner picks advanced for the next season and it survives a restart.
- `generated-campaign-api`: **22 checks** (was 19): starting in simple and in advanced mode through the local tool, a retry cannot change the mode, simple mode refuses a defense order. `star-map-component`: 13 checks, two rewritten for the single mode picker.
- All other suites unchanged and passing: fleet-selection 39, fleet-component 12, intel-component 10, draft-session 29, draft-editing 25, draft-edit-ui 45, planet-component 28, real-sky-rotation-component 25, material-reservations 19, real-sky-projection, system-panel-component, planet-scale, planet-api 14, real-campaign-api 14, smoke 73, accounts 30 (37 with the hosted PostgreSQL configuration).

Problems found while verifying:

- **Earlier results for one suite were against an old build.** `generated-campaign-api` runs `bin/Release` unless `DEEPFIELD_TEST_API_DLL` is set. The Release build on this machine dated from the milestone 2 publish check, so the "generated-campaign-api 19" lines recorded for milestones 2 and 3 did not exercise that milestone's code. From this milestone on it is run with `DEEPFIELD_TEST_API_DLL` pointing at the Debug build and `DEEPFIELD_TEST_WEBROOT` at a fresh web build. It passes on the current code, which contains milestones 2 and 3.
- **Save replace could fail under load.** Twice a request failed with `IOException: Unable to remove the file to be replaced` while another process briefly held the save file. `FileGameStore` now retries the replace for up to a second. After the fix the suite passed four runs in a row; the cause (a scanner or indexer on this machine) is inferred, not proven.
- **One older rules check fails by chance.** `RealCampaignChecks` "New balance did not improve early construction and fuel supply" failed in 2 of 20 consecutive runs of the full suite. It compares two campaigns that each draw random deposits. Neither that check nor `Materials.cs` was changed by this work. It is left as is and should be made deterministic separately.
- `planet-component` timed out once loading its page while the machine was busy and passed on two reruns.

Not verified: any game played by people in either mode; balance of advanced mode with the tapered economy on the real-star map (the local tool previously created advanced-style campaigns with the flat economy); the mode picker on phones; the `Mode` hosting setting beyond one manual try on a throwaway local server (`Mode=Advanced` produced an advanced campaign); anything in a real hosted environment.

## Seasons and replayability (milestone 3) - 2026-11-26

Branch `feature/seasons`, stacked on `feature/hosting-accounts`. No deployment. The running playtest, its keys and its save were not touched; tests used throwaway saves under `test-results/` or the system temp folder, loopback ports 5096 to 5098, and the same disposable embedded PostgreSQL as milestone 2.

- **Update, same day: winning condition configured by the game creator.** Final counts after this addition: `Deepfield.Checks` with PostgreSQL **306 checks passed** (40 season checks), `npm run test:seasons` **31 checks**, all other suites unchanged and passing; a full non-incremental build has 0 warnings and 0 errors (an earlier incremental build had hidden two nullable warnings in the new test file, now fixed). New checks cover: standard condition when none is chosen; out-of-range values refused; only the owner can set it, only before the first turn resolves or when starting a season; a lowered threshold decides the season; a turn limit does not end a season early and decides it on colonies, then collectors, with equal clans sharing; the condition is kept or replaced across seasons, saved, shown to both clans and survives a restart. The `Victory` hosting settings were tried once by hand on a throwaway local server (3, 5, 20 came back in the campaign view); they have no automated test.
- `dotnet build Deepfield.sln`: 0 warnings, 0 errors (the first build after a frontend change still fails once in static web assets and passes when repeated).
- `Deepfield.Checks` with `DEEPFIELD_TEST_POSTGRES` set: exit code 0, **295 checks passed**: the 266 from milestone 2 plus **29 season checks**.
- Season checks cover: map seed 0 reproduces the original layout link for link (pinned from a save written before this change); 300 seeds are repeatable, fully connected, keep the same real stars, and reject tampered or mismatched snapshots; homeworlds are always at least 3 jumps apart, neighbouring-system counts differ by at most 1 and nearer territory by at most 4 of 24 systems; victory records the end time and shows both clans the final standings; the next season keeps clans, AI seats, clan channels and rule choices and resets everything else; repeated or unconfirmed requests are refused; history keeps 50 seasons; saves from before seasons load as season 1; an original-map campaign continues into a real-star season; a failed start leaves the save unchanged.
- Measured variety across seeds 1 to 300: **190 distinct homeworld pairs, all 24 systems used as a homeworld, 300 distinct link layouts**. Separation ranged from 3 to 9 jumps.
- New `npm run test:seasons` (`web/tests/seasons-api.mjs`): **24 API and browser checks** with a real server and Microsoft Edge: victory and defeat screens with standings, results banner, owner-only start control (a player gets 403), season 2 on a different map with one homeworld each, history for both clans, clan channel carried over and still private, repeated request refused, ending early needs an explicit tick, restart persistence, and clan-key development behaviour (original map by default, `MapSeed`, season control only for a local test session).
- The season in that test was decided by editing the throwaway save while the server was stopped, not by playing to a win. Reaching victory through real turns is covered only at the rules level.
- All other web suites pass unchanged: fleet-selection 39, fleet-component 12, intel-component 10, draft-session 29, draft-editing 25, draft-edit-ui 45, planet-component 28, star-map-component 13, real-sky-rotation-component 25, material-reservations 19, real-sky-projection, system-panel-component, planet-scale, planet-api 14, real-campaign-api 14, generated-campaign-api 19, smoke 73, accounts 30 (37 with the hosted PostgreSQL configuration).

Not verified: play balance of seeded maps beyond the structural fairness measures above (no simulated or human games were played on them); the victory screen on phones; anything in a real hosted environment.

## Hosting and accounts (milestone 2, prepared only) - 2026-11-26

Branch `feature/hosting-accounts`. Nothing was deployed. No cloud resource, DNS record or public address was created. The running playtest, its keys and its save were not touched; every test used throwaway saves under `test-results/` or the system temp folder, and loopback ports 5097 to 5099.

PostgreSQL was a disposable embedded server (PostgreSQL 19.0, npm package `embedded-postgres`) started on loopback port 5546 in a scratch folder outside the repository and deleted after each run. This is the first time the PostgreSQL code paths have been executed at all.

- `dotnet build Deepfield.sln`: 0 warnings, 0 errors. The first build after a frontend change still fails once in static web assets and passes when repeated.
- `Deepfield.Checks` with `DEEPFIELD_TEST_POSTGRES` set: exit code 0, **266 checks passed**. Groups: 50 engine and persistence (now including the PostgreSQL campaign store, single-connection pool and entropy migration), 62 reconnaissance and migration, 14 economy and defense, 19 ship design, 25 typed fleet, 8 preview storage, 17 local turns, 17 planet statistics, 16 star map, 10 generated campaign, **40 account checks** (32 rules, 4 file store, 4 PostgreSQL store).
- Without the variable the suite still passes and prints that the PostgreSQL checks were skipped (36 account checks).
- Web lint and production build: pass.
- New `npm run test:accounts` (`web/tests/accounts-api.mjs`): **30 API and browser checks** with a real server and Microsoft Edge: owner setup with the setup key, invitation link, joining the invited clan, owner-only controls, clan channel signed with the account name (a forged author is ignored), sign-out, uniform sign-in errors, one-time reset link, moving and disabling a player, restart persistence, sign-in rate limit, and clan keys still the default in local development.
- The same test with `DEEPFIELD_TEST_POSTGRES` set adds **7 hosted checks (37 total)** in Production mode: starts without clan keys, plain HTTP redirects to HTTPS (308) behind a trusted proxy, HSTS is sent, health and readiness answer over plain HTTP, the cookie is `__Host-` prefixed, Secure, HttpOnly and SameSite=Strict, a new database gets a real-star campaign, local turn controls are absent, and campaign, accounts and sessions survive a restart.
- Existing web suites, all passing: fleet-selection 39, fleet-component 12, intel-component 10, draft-session 29, draft-editing 25, draft-edit-ui 45, planet-component 28, star-map-component 13, real-sky-rotation-component 25, material-reservations 19, real-sky-projection, system-panel-component, planet-scale, planet-api 14, real-campaign-api 14, generated-campaign-api 19, smoke 73. `draft-session` and `draft-edit-ui` needed one line each so their fake server answers the new sign-in-mode request.
- Publish layout: `dotnet publish -c Release -p:BuildDeepfieldFrontend=false` plus the web build copied into `wwwroot`, run in Production against the disposable PostgreSQL behind simulated proxy headers: readiness, the page, its script bundle and the account state endpoint all answered 200.

Not verified, stated plainly:

- **The `Dockerfile` has never been built.** Docker is not installed on this machine. Only the equivalent publish layout above was run.
- No cloud provider, real certificate, real proxy or managed PostgreSQL was involved. Forwarded-header handling was tested with hand-written headers only.
- No security review by a second party. No load testing.
- Windows Smart App Control intermittently blocked freshly built, unsigned test binaries on this machine. Rebuilding the affected project produced a build that loaded. The setting was not changed.

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
- TypeScript build/unused checks and Vite production build passed. Mobile intelligence screenshot inspected (`test-results/scout-intelligence-mobile.png`). The browser fixture deliberately uses 100% return rates for its full-report scenario; the original engine fixtures verified the then-current 90/65/35 defaults. The current recon suite instead checks guaranteed distant return for new campaigns, unchanged stored odds for existing saves, and loss cases for close and deep.
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

## Isolated preview Run turn - 2026-10-16

23 actual-React/synthetic-API Edge checks pass (14 prior draft/session checks plus nine Run turn cases). New coverage: capability hidden for normal campaigns, local visibility, unsent-draft lock, repeated click single request with expected turn and no implicit order PUT, refreshed reports, failed-action unlock, stale retry, ambiguous order-submission lock and completed-campaign lock. Frontend lint/build and smoke-script syntax checks pass. Inspected ignored screenshot test-results/run-turn-preview.png.

Added 17 C# capability/persistence checks for Development/explicit opt-in, local host/address and proxy enforcement, scheduler-first/button-first transactions, concurrent duplicates, reopening the save and completed campaigns. Added three API smoke assertions for isolated preview capability and repeated expected-turn requests, and updated button labels in existing integration tests. These backend/runtime tests are authored and compiled but UNRUN while Deepfield execution remains paused; no API instance was launched or restarted by this work.

SDK 10.0.402 compiled all four projects with zero warnings/errors (10.06 seconds) using `dotnet build Deepfield.sln -m:1 --disable-build-servers --artifacts-path C:\Users\chris\AppData\Local\Temp\deepfield-run-turn-compile`. Normal output compilation initially overlapped frontend asset replacement, then failed on DLLs locked by Microsoft Visual Studio (26720) and Deepfield.Api (35976). Separate compile artifacts avoided modifying locked output; they were never executed. During the first invocation the newly installed SDK's first-run setup reported installing an ASP.NET development certificate. No certificate trust command, security-policy change or manual certificate installation was performed.

The user's modified launchSettings.json and untracked .vs directory remain outside commits. Keys were neither printed nor staged. Existing game saves and the original checkout were not modified. Loading instructions and disposable-preview restart behavior are in VISUAL_STUDIO.md.

## Draft maneuver editing - 2026-10-16

Aggregate `npm.cmd run test:frontend --prefix web` passed 122 checks: 34 fleet validation, 12 fleet component, 10 intelligence component, 23 draft/session, 21 edit validation and 22 edit interaction checks. Frontend lint and production build passed. Inspected ignored test-results/edit-draft.png showing the actual React editor with synthetic data.

New regression coverage includes prefilled values, own-reservation exclusion with other reservations retained, stable replacement identity/order, repeated Save, source/hull/action changes, numeric limits, ownership/budget/scout/defense/hull caps, cancellation via Cancel/Escape/Close/Back, cancellation during validation, changed server turn, refresh invalidation, leaving the session, ambiguous submission locks, committed-order exclusion and omission of local metadata from API payloads. All browser requests were intercepted fixture responses; no live API, real keys or game saves were used.

No backend code changed or Deepfield executable ran. Full real-API integration remains unrun under the existing execution limitation; synthetic tests do not replace that evidence. Local launchSettings.json changes and the .vs directory remain untouched and excluded from commits. The aggregate runner was briefly slow but completed successfully; no current frontend validation blocker remains.

## Habitability and colonization planner - 2026-11-26

Run in the `Deepfield-scouts` worktree on `feature/habitability-colonization`. No existing campaign save was used; every suite writes disposable saves under the temp folder or `test-results`.

- `dotnet build Deepfield.sln --disable-build-servers`: succeeded, 0 warnings, 0 errors. The first build after a frontend source change fails once in the static web assets step because the frontend is rebuilt with a new file hash mid-build; an immediate second build succeeds.
- `dotnet run --project tests/Deepfield.Checks`: exit code 0, 219 PASS lines, no failures. PostgreSQL integration was skipped because `DEEPFIELD_TEST_POSTGRES` is not configured.
- `npm run lint` and `npm run build` in `web`: both passed.
- Web test scripts that passed: fleet-selection 39, fleet-component 12, intel-component 10, draft-session 29, draft-editing 25, draft-edit-ui 45, planet-component 28, star-map-component 13, real-sky-rotation-component 25, real-sky-projection 5, material-reservations 19, real-campaign-api 14, generated-campaign-api 19, plus system-panel-component and planet-scale (no per-check count).
- `planet-api.mjs` and `smoke.mjs` first failed because both were out of date: they assumed the original fixed 12-star layout (Hearth, Lumen, Dawn) and the earlier command deck, while fresh development campaigns now use the real-star map. Both tests were updated to read star names and the rival homeworld from the campaign and to use the current selected-system panel, statistics dossier and details tabs. No application code changed. Results after the update: `planet-api.mjs` 14 checks passed, `smoke.mjs` 73 checks passed.
- `planet-api.mjs` runs against isolated artifacts, which must be rebuilt first: `dotnet build Deepfield.sln -m:1 --disable-build-servers --artifacts-path ./test-results/planet-build` and `npm.cmd run build --prefix web -- --outDir ../test-results/planet-web`. `smoke.mjs` uses the normal Debug build and port 5097; it is now available as `npm run test:smoke`.
- The standalone rotatable planet preview is no longer mounted on the command deck, so its two size checks were removed from `planet-api.mjs`.
- The guaranteed distant scout return applies to newly created campaigns only. Existing saves keep their stored rates, and a save with no stored rates falls back to the original 90/65/35. Recon checks cover all three cases.
