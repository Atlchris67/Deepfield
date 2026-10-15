# Typed fleet preview and expedition selection

The new fleet rules are opt-in for a **new campaign** with `CombatVersion=1`. Existing schema 1–3 campaigns migrate additively to schema 4 but retain generic ships and their combat rules. Setting the environment variable does not convert an existing save. There is no live campaign migration or deployment in this increment.

Five original hull classes share the counter model described in COUNTER_LAB.md. Starting ships are interceptors. Construction costs are 5/10/15/12/8 credits for interceptor/torpedo/cruiser/bomber/disruptor. Every hull has two counters; fixed defenses use the interceptor profile. Combat reports show own per-class losses; exact opening enemy composition requires a surviving observer. Deep reconnaissance records historical composition. AI buys counters only from its own recent private observations, using the same legal orders as human clans.

## Expedition rules and UI

- Select a source, linked charted destination and count per hull in the fleet modal. Classic campaigns show one generic Ships row.
- Availability is existing source inventory minus **all drafted departures of that class**, regardless of destination. Drafted construction and incoming ships are never available early.
- Each movement order is limited to 100 ships. The modal creates one order for each selected hull; multiple orders may exceed 100 total, but never source inventory. The campaign permits 24 total orders per turn.
- Eight existing ships cannot send ten. Drafting three leaves five, so another six is blocked before drafting. The API also validates the entire plan before replacing it; invalid aggregates do not partially execute.
- Confirmation rereads campaign state. Changed inventory updates counts and rejects over-selection. Changed turn or teammate revision requires explicit refresh so a local draft is not silently replaced.
- Cancel, Escape and browser Back discard the selection. Repeated Add clicks are latched. Cancellation during a pending availability read cannot append delayed orders. Source changes reset all selected counts; leaving a clan unmounts private modal state.

## Settling and collectors

Movement resolves simultaneously, followed by combat. Two surviving generic ships (classic rules), or two surviving interceptors (typed rules), are consumed to establish a colony. Specialists and scouts cannot provide habitats. A surviving attacker destroys the rival colony's collectors before establishing a replacement colony.

Collectors cost 30 credits and require an owned colony **when orders are submitted**. After settling at a resolution, queue the first collector during the following turn; it completes at that turn's resolution. Selected observed systems prominently display collector count; unknown counts stay hidden. The opt-in economy preview grants diminishing collector income of +3, +2, +1 and then zero per colony; classic income remains unchanged.

## Isolated local run

Build following README, then use process-local keys of at least 24 characters and a distinct unused save path. Do not reuse the live playtest save:

```powershell
$env:SavePath = Join-Path (Get-Location) 'data/typed-preview-new.json'
.\scripts\run-local.ps1 -Port 5098 -Accelerated -HumanEmpire -EconomyPreview -TypedFleets
```

Open `http://127.0.0.1:5098`. The command runs in the foreground and does not install a service or configure network access. Existing port 5080 stays untouched. Omit `-Accelerated` for daily deadlines. Never expose accelerated mode through a tunnel.

Balance, PostgreSQL runtime integration, individual accounts and public hosting remain follow-up work. Collector shading and the custom clan ship designer remain deferred.
