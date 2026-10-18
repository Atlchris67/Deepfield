# Planet statistics modal

Select a map system, then choose **View planet statistics** below the map. The read-only dossier uses the authenticated campaign response. It does not submit orders or resolve turns.

## Scope and data contract

The implementation stages are server projection, accessible modal, then sequential local rule/browser verification. There is no new survey action, economy simulation, save schema, or resolution rule.

- Each system represents one colony site. Mineral/material resources and inhabitants/population are not simulated; both fields say **Not measured**. Charting is not a completed survey.
- Current visibility follows the existing server rule: your colony or your combat ships present. The dossier labels this as the campaign snapshot at the last refresh, not continuously live data.
- Otherwise, use the latest clan-private report for that system, ordered by turn and timestamp. Report list order breaks same-time ties. Show its turn, timestamp, mission and observation phase; it may be stale even within the current turn. Never combine differently dated observations into apparent current state. Older reports remain in Clan intelligence.
- Distant scouts disclose contact/ownership; close scouts add fleet ranges; returning deep scouts add exact measured ships, scouts, collectors and defenses. Battle reports can lack scout/infrastructure counts. Destroyed scouts have limited contact only. Missing values stay unknown, including ship totals when scouts are unmeasured.
- Typed campaigns show five hull classes. Classic campaigns show generic combat ships. Combat totals exclude scouts; total ships includes scouts only when both counts are known. Observed zero remains zero.
- Colony income is calculated server-side from existing rules only for currently observed own colonies. It excludes queued construction. Enemy treasury and current unobserved state are never read by the dossier projection.

`PlanetStatistics.Project` accepts an already-filtered `StarView` and that clan's authorized intelligence, rather than the raw galaxy. `Rules.Observe` attaches its result to each star. The UI reads only this projection. The API authentication boundary remains unchanged. No saved state is added, so existing campaigns need no migration.

The native modal dialog provides focus containment, initial Close-button focus, Escape, close-button and backdrop dismissal, and focus return. A backdrop dismissal requires pointer down and up outside the dialog; clicks inside do not close it. The header stays visible while long mobile content scrolls, and page scrolling is restored after closing.

## Local verification recipe

Run sequentially from the checkout root. These commands use isolated build output and disposable test state, preserving a running preview's binaries/static files. No GitHub invocation is needed. Installed Edge is used for browser checks.

```powershell
dotnet build Deepfield.sln -m:1 --disable-build-servers --artifacts-path ./test-results/planet-build
Remove-Item Env:DEEPFIELD_TEST_POSTGRES -ErrorAction SilentlyContinue
$env:DEEPFIELD_PLANET_FIXTURES = Join-Path $PWD.Path 'test-results/planet-fixtures.json'
dotnet test-results/planet-build/bin/Deepfield.Checks/debug/Deepfield.Checks.dll
npm.cmd run lint --prefix web
npm.cmd run build --prefix web -- --outDir ../test-results/planet-web
npm.cmd run test:planet-ui --prefix web
npm.cmd run test:planet-api --prefix web
```

The C# suite generates browser fixtures from real projection results, including a resolved deep-scout mission, rather than hand-duplicating expected frontend data. The component harness tests these fixtures; the API harness launches only its own process on an OS-assigned loopback port with temporary content root, fresh keys, isolated preview storage, and an explicit manifest for the isolated frontend assets. Both browser harnesses close their own processes. They never connect to the existing 5080/5098 campaigns. Screenshots are ignored files in `test-results/planet-desktop.png` and `test-results/planet-mobile.png`.

## GitHub usage

There are no tracked `.github/workflows` files in this checkout. No workflow change is needed, and no required checks were removed. Keep validation local and publish a reviewed batch only when requested; this increment makes no pushes, reruns or deployments. Other repositories and account billing settings are untouched.

## Verified 2026-10-18

- Four-project .NET build succeeded with no compiler errors or compiler warnings. NuGet emitted NU1900 because its vulnerability-data endpoint was unreachable; vulnerability auditing was not disabled and dependencies were not changed.
- 156 backend checks passed, including 17 new dossier cases and existing rule, secrecy, persistence/restart and turn checks. PostgreSQL integration was skipped because no disposable database was configured.
- TypeScript/Vite production build and TypeScript unused-code lint passed. Frontend assets were emitted only to the isolated test output.
- 24 new headless Edge component checks passed using server-generated fixtures; 9 new real API/browser checks passed using disposable state. Desktop and mobile screenshots were visually inspected.
- All 122 existing frontend regression checks passed sequentially. `git diff --check` passed.

The sandbox initially denied temporary-save atomic replacement and Edge temporary-profile operations; approved host-side retries passed. The first API/browser attempt loaded the old development static-assets manifest; the harness now explicitly supplies its own isolated manifest, and the complete rerun passed. No security settings, real saves, running previews, credentials or user assets were modified. Manual screen-reader testing and PostgreSQL integration remain untested. The feature is committed locally, not deployed to the running preview.
