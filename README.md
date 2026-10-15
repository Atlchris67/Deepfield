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

## Run locally

Requires .NET 10 SDK and Node 22.12+ (tested with 22.23.2). From the repository root:

```powershell
dotnet restore
npm.cmd ci --prefix web
npm.cmd run build --prefix web
dotnet build Deepfield.sln -m:1

# Temporary process-local team keys. Retain them in your own session to reconnect.
$env:Teams__0__Key = [guid]::NewGuid().ToString('N')
$env:Teams__1__Key = [guid]::NewGuid().ToString('N')
# Display only to the local operator; share each key only within its clan.
$env:Teams__0__Key
$env:Teams__1__Key
./scripts/run-local.ps1 -Accelerated
```

Open **http://127.0.0.1:5080** and enter a clan key. `-Accelerated` adds the explicit one-turn test button. Omit it for real daily timing. Add `-HumanEmpire` when creating a **new** campaign to make both clans human-controlled. The API reads AI choice and seed only when creating the save. Existing saves retain their settings. `Seed` defaults to 42017; the seed sets the visual layout, while all rules are deterministic with no random combat.

The launcher is foreground-only, binds loopback, disables launch profiles, and uses `data/campaign.json`. Stop it with Ctrl+C. Reopening with the same save resumes the campaign and its deadline. Keys are external to the save; keep the same keys for continuity. To start another local campaign, choose a different `SavePath` before launching. Do not delete a valued campaign to reset a test.

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

For traditional solution files and IDE setup, see [Visual Studio build instructions](docs/VISUAL_STUDIO.md). Compilation and Windows execution permission are separate; the known runtime block remains unresolved.
