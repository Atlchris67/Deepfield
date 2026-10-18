# Deepfield

## Opt-in economy and defense preview

For a **new isolated test campaign**, set a fresh `SavePath` and launch with `-EconomyPreview` (equivalently `EconomyVersion=1` when creating a campaign). Existing saves retain their stored ruleset; schema upgrades do not activate new balance rules. Never reuse the running playtest path for a preview.

In this preview each colony still earns 15 credits, plus collector income: the first collector adds 3, the second 2, the third 1, and further collectors add no income. Maximum income is **21 per colony per turn**. Collectors still cost 30 and count toward the existing Type III goal. Newly completed collectors earn income that turn.

Fixed defenses cost **8 credits for 2 strength**, capped at **6 strength per colony** across all queued purchases. They finish before arrivals/combat, cannot move, and permanently lose strength when attacked; no automatic regeneration. Defenses absorb casualties before the colony's ships. Combat otherwise remains deterministic one-for-one strength attrition. Eight attacking ships can destroy an ungarrisoned strength-6 defense and found a colony with the final two ships. Capture destroys remaining infrastructure. Scouts' deep reports include observed defense strength; no hidden defenses affect mission-risk estimates.

These values are an explicitly provisional, bounded test ruleset, not a finished balance model. Specialized ship counters, blockades and ship design remain separate work.

## Scout reconnaissance increment

Dedicated scouts cost **3 credits**; existing combat/colony ships still cost 5. Build scouts on your colony and use **Scout reconnaissance** on a later turn. Each mission uses one existing scout, visits an adjacent charted system, and attempts to return to its launch colony within the same turn. Scouts cannot fight, colonize, or use ordinary fleet movement. Survivors can be reused next turn; failed missions consume the scout. Grounded scouts are destroyed if their colony falls.

Choose **distant (90%)**, **close (65%)**, or **deep (35%)** initial safe-return targets. These are provisional campaign settings, with no secret defense modifiers. Successful distant missions report contact and ownership; close adds a combat-fleet size band; deep adds exact combat ships, scouts and collectors. Full information requires escape. A destroyed scout reports only confirmed enemy contact or unconfirmed contact, never exact counts or ownership.

The **Clan intelligence** panel stores private reports with turn, timestamp and observation phase. Reports sample the simultaneous-arrival phase before combat and remain explicitly last-known, not live views. New snapshots never overwrite old history. The last 200 reports are retained. The running legacy playtest is unchanged; this development checkout and browser tests use isolated state and port **5097**. See [roadmap and migration boundaries](docs/ROADMAP.md).

An original, small daily-turn space strategy game for family clans. Guide the Aurora Federation or Ember Empire from a shared homeworld toward a simplified Kardashev Type III victory. The playable slice includes exploration, automatic colony expeditions, ship construction, simultaneous combat, collectors, private clan messages and turn reports. Empire runs as AI by default; both clans can be human-controlled.

**Status:** local MVP; no live deployment. One shared homeworld, treasury and order list per clan is provisional. No license has been selected.

## Run locally on Windows

Use PowerShell with the **.NET 10 SDK** and **Node 22.12+** installed (Node 22.23.2 was tested). The projects target `net10.0`. These commands are for this development checkout on Piedmont:

```powershell
Set-Location 'C:\Users\chris\Documents\Codex\2026-10-14\task\Deepfield-scouts'
dotnet restore Deepfield.sln
npm.cmd ci --prefix web
npm.cmd run build --prefix web
dotnet build Deepfield.sln -m:1
```

Run the build steps on first setup or after code/dependency changes; stop if a step fails. Both `.sln` and `.slnx` exist, so specify `Deepfield.sln`. If this checkout is already running in Visual Studio, rebuilding can encounter locked DLLs; finish that preview session before rebuilding it. Leave the separate original game alone. Startup below uses the already-built API and frontend.

### 1. Set both clan keys in the same PowerShell window

Replace the obvious placeholders below with your own private strings **before running them**. Each key must contain at least **24 characters**, and the two keys must differ. To reconnect to an existing campaign, reuse its configured keys. Do not put real keys in source control or this README.

```powershell
$env:Teams__0__Key = 'REPLACE_WITH_YOUR_AURORA_KEY_24_PLUS_CHARACTERS'
$env:Teams__1__Key = 'REPLACE_WITH_YOUR_EMBER_KEY_24_PLUS_CHARACTERS'
```

These assignments affect this PowerShell process and the app it starts. Keep this window open and run **one** of the startup options below in it. Setting keys in another terminal does not configure this one.

At the browser's clan login, enter the **value** you assigned to `Teams__0__Key` for **Aurora Federation**, or the value assigned to `Teams__1__Key` for **Ember Empire**. Enter only the key itself, without the variable name or surrounding PowerShell quotes. There is no separate username/password pair; members of a clan share its key. Empire is AI-controlled by default.

### 2A. Persistent local campaign (resume the same save)

The following uses this checkout's `data\campaign.json`, creating it if absent. If your existing campaign lives elsewhere, replace the `SavePath` assignment with its exact path. This checkout's default does **not** resume the original game's save in another checkout. Never start another server against a save already in use.

```powershell
$env:IsolatedPreview = 'false'
Remove-Item Env:ConnectionStrings__Deepfield -ErrorAction SilentlyContinue
$env:SavePath = Join-Path $PWD.Path 'data\campaign.json'
.\scripts\run-local.ps1 -Port 5099
```

Open **http://127.0.0.1:5099** in a **web browser**, not as a PowerShell command. This example selects port 5099 to leave the original game on port 5080 alone; check that 5099 is free before starting. The script defaults to 5080 if `-Port` is omitted. A different port still needs a separate save when another campaign is running.

The script enables Development, binds loopback, and disables launch profiles. Normal turns use daily deadlines. For an intentionally accelerated local test campaign, add `-Accelerated` to enable the explicit **Run turn** button. Add `-HumanEmpire` when creating a **new** campaign to make both clans human-controlled. Existing saves retain their AI/rules settings. Seed defaults to 42017; rules and combat are deterministic.

Stopping and reopening with the same save resumes that campaign and its persisted deadline. Keys are external to the save; retain them separately. To create a different persistent campaign, choose a new `SavePath`; do not delete a valued save to reset a test. Removing the connection-string environment variable above affects only this shell and its future child processes, not a database or another running server. These instructions use the Development file store; see storage below for PostgreSQL.

### 2B. Isolated disposable preview (fresh on every launch)

Use this option for a throwaway campaign. First set both keys as in step 1. Port 5098 must be free; if your Visual Studio preview already uses it, open that existing preview instead of starting a second copy.

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:5098'
$env:IsolatedPreview = 'true'
$env:LocalTest = 'false'
$env:EmpireAi = 'true'
$env:EconomyVersion = '0'
$env:CombatVersion = '0'
Remove-Item Env:SavePath -ErrorAction SilentlyContinue
Remove-Item Env:ConnectionStrings__Deepfield -ErrorAction SilentlyContinue
dotnet run --project .\src\Deepfield.Api --no-launch-profile --no-build
```

Open **http://127.0.0.1:5098** in a **web browser**. The app selects a new `%TEMP%\deepfield-preview-<guid>\campaign.json` on each launch. Restarting **does not resume** the previous preview. Isolated preview rejects an effective explicit save path or database connection string; it never falls back to your existing campaign. If configuration elsewhere still supplies either setting, startup fails and that configuration needs review.

Development isolated preview enables **Run turn** even with `LocalTest=false`. Commit your draft orders before using it. Do not use `run-local.ps1` for this isolated mode: that script supplies an explicit save path, which the preview correctly rejects.

### 3. While the app is running / stopping

Startup runs in the **foreground**. The terminal stays busy showing logs; that is expected. Wait for the listening message, then use the browser URL above. Keep the terminal open while playing. Press **Ctrl+C in that terminal** to stop the server. Do not paste more commands into the running server's terminal. After it stops, the shell's environment settings remain until changed or the shell closes; repeat the desired mode's settings before switching modes.

### Visual Studio startup and keys

Open `Deepfield.sln`, set `Deepfield.Api` as the startup project, and select **Deepfield isolated preview**. That profile uses **http://127.0.0.1:5098**, Development and isolated preview storage. It does not automatically open a browser. Each new launch creates a fresh disposable campaign; stop the IDE's debugging session to stop that server.

Visual Studio launches with the selected profile's environment settings. **Keys supplied in your local `launchSettings.json` profile override inherited keys**; enter those effective values at clan login. Preserve your existing local keys and keep them out of commits. If the profile does not supply keys, Visual Studio must inherit both from the environment in which it starts. Assigning `$env:Teams__0__Key` and `$env:Teams__1__Key` in a new PowerShell window does not update an already-running Visual Studio instance. The PowerShell examples above deliberately use `--no-launch-profile`, so they use that shell's keys rather than the IDE profile's values.

See [Visual Studio build instructions](docs/VISUAL_STUDIO.md) for solution details and historical build/runtime observations. The startup commands here were checked against the current source; this documentation update does not itself start or stop a game.

## Play

1. Discuss the turn in the private clan channel. Members share the same resources and plan; call signs are labels, not individual accounts.
2. Select your homeworld and send a fleet along a link to a charted system. Two surviving ships automatically become a colony. One ship scouts without colonizing. Fog hides ownership, collectors and ships outside your current colonies/fleet locations.
3. Build ships for 5 credits each and collectors for 30. New ships cannot move until the following turn. Each colony earns 15 credits per turn.
4. Commit the complete order list. A teammate's newer revision prevents stale overwrites. Refresh explicitly replaces your local draft. A failed network submission can be retried with the same request ID.
5. At the deadline all movements apply simultaneously, then fleets inflict equal losses. Survivors destroy an opposing colony's collectors and may found a colony. Fleets crossing on links pass each other; combat happens at stars. Equal fleets mutually destroy. Ungarrisoned colonies have no defense.
6. Hold at least **4 colonies and 8 collectors** to win. Both clans reaching this threshold together share victory. Read reports after resolution.

Topology and coordinates are public; unknown star names and current intelligence are filtered. “Charted” never means “safe.” The Type III goal is intentionally a compact gameplay abstraction, not a scientific scale simulation.

## Storage and turn safety

- Production persistence is PostgreSQL through `ConnectionStrings__Deepfield`. The API creates a single `deepfield_campaign` table and one JSONB aggregate row. Configure an already-provisioned database yourself; this repository does not provision credentials, accounts or services.
- Every write uses a PostgreSQL transaction and `SELECT … FOR UPDATE`. Pending orders, receipts, messages, reports, deadline and turn are committed together. Multiple resolvers serialize on the same campaign row.
- Development may use the file store: a cross-process exclusive lock, flushed temporary file, then atomic replacement on the same local filesystem. Use PostgreSQL for hosted/shared operation, not network-mounted files. Back up the campaign/database before future schema migrations.
- At most one overdue turn resolves on startup. Its next deadline is **actual resolution time + 24 hours**, so outages never burn through missed days. The worker checks every five seconds. Closed-turn submissions are rejected even before the worker runs.
- Last 256 submission receipts per clan, 200 board messages and 100 report lines are retained. Exact order retries return the original receipt; changed payloads cannot reuse its ID. Expired old-turn receipts do not permit a second execution.
- The local test endpoint requires Development, explicit opt-in, loopback client and hostname, and no forwarding headers. It accepts the expected turn, making concurrent/repeated test clicks safe. Production refuses file persistence. The server does not trust proxy forwarding headers.

## Verify

```powershell
dotnet build Deepfield.sln -m:1
dotnet run --project tests/Deepfield.Checks --no-build
npm.cmd run lint --prefix web
npm.cmd run build --prefix web
Push-Location web
node tests/smoke.mjs
Pop-Location
```

The executable C# suite intentionally needs no test-framework dependency; it exits nonzero on failure. It checks the pure rules and real file-store concurrency/reopening/rollback. Set `DEEPFIELD_TEST_POSTGRES` only to a **disposable, empty test database** to additionally run the same transactional store checks against PostgreSQL. Do not point it at a real campaign.

The browser suite uses installed Edge by default (`BROWSER_CHANNEL=chrome` also works), temporary loopback API instances on port 5097, random process-only keys and isolated saves under ignored `test-results/`. It tests auth, private data, requests/retries, concurrent resolution, actual process restart, outage behavior, UI actions, mobile overflow and disabled acceleration. It closes every process it starts. Screenshots land in `test-results/command-desktop.png` and `command-mobile.png`. No external service is contacted by the running game.

## Repository map

- `src/Deepfield.Engine`: pure state, visibility and rules; no storage or web dependencies.
- `src/Deepfield.Api`: team-key boundary, transaction stores, background daily worker and static UI hosting.
- `web`: React/TypeScript command deck and browser smoke harness.
- `tests/Deepfield.Checks`: deterministic rule and persistence checks.
- `docs/PLAN.md`: scope and invariants; `docs/VERIFICATION.md`: actual evidence and limitations.

## Remaining scope

PostgreSQL integration needs execution against an available disposable server. Before public hosting: individual users/invitations, membership and key rotation, rate limits, operational backup/recovery, and explicit proxy/HTTPS/access configuration. No DNS, Cloudflare Tunnel, firewall, external accounts, production credentials or persistent services have been configured. Additional campaigns, richer ship designs, diplomacy, balance tuning and accessibility testing are follow-up work. Federation/Empire use original names and styling, with no franchise assets.

The repository now has an agreed documentation baseline on main. Development is published as stacked draft PRs; none is merged automatically.

## Typed fleet preview
See [typed fleet rules and local preview](docs/TYPED_FLEETS.md) for opt-in hulls, the expedition selector, settlement timing and a separate port/save path. Existing campaigns retain generic ship rules.

For traditional solution files and IDE setup, see [Visual Studio build instructions](docs/VISUAL_STUDIO.md). Its earlier runtime-block notes describe those historical attempts; use the Windows startup section above for the current launch workflow.
