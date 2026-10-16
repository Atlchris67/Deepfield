# Build Deepfield with the existing C# projects

Open `Deepfield.sln` for the traditional Visual Studio solution. It references the same four `.csproj` files as `Deepfield.slnx`: API, engine, executable checks and combat laboratory. No duplicate C# projects or framework retargeting are needed. Keep both solution project lists in sync when adding projects. Because both formats exist, specify the solution name in CLI build commands.

## Installed tools and compatibility

On Piedmont, inspection found .NET SDK **10.0.400**. Visual Studio Installer's `vswhere -all -products *` reported **SQL Server Management Studio 22 only**, not a Visual Studio IDE or Build Tools instance. SSMS is not the C# development IDE. No installation was performed.

All projects target `net10.0`. Microsoft supports this target in **Visual Studio 2026 / 18.0+**; SDK 10.0.4xx ships with 18.9, with 18.0 listed as its minimum supported Visual Studio version. Use a current compatible Visual Studio with the ASP.NET/web workload and .NET 10 tooling if an IDE is installed later. See [Microsoft's compatibility table](https://learn.microsoft.com/en-us/dotnet/core/porting/versioning-sdk-msbuild-vs). The SDK CLI can compile without the IDE.

## Build without launching

From the isolated checkout root:

```powershell
dotnet build Deepfield.sln -m:1 --disable-build-servers
npm.cmd run build --prefix web
```

The .NET build compiles four projects. It does not run the check executable or start the API. The frontend build separately writes static assets into the API's ignored `wwwroot`; use `npm.cmd ci --prefix web` first only when dependencies have not already been installed.

In a compatible Visual Studio installation: File > Open > Project/Solution > `Deepfield.sln`, choose Debug / Any CPU, then Build > Build Solution. Set `Deepfield.Api` as the startup project for a future permitted run. Test Explorer does not automatically run our console-based checks; their explicit execution remains paused.

## Running is a separate, currently blocked step

Compilation does not grant Windows permission to load the resulting DLL. The unchanged API DLL SHA256 `6D0EAC1D5AFE8F7EA96BF797EE423EA525188394E75D534CFDA5B40EF83E3B20` was blocked by Code Integrity events 3033/3077 under `VerifiedAndReputableDesktop`. A read-only check still reports `VerifiedAndReputablePolicyState=1` (Smart App Control On). Do not use Visual Studio/debugging, another launcher or a different output path to evade that block. We have not retried application execution or changed protection.

Once a supported execution path is approved, the prepared **Deepfield isolated preview** profile binds only `127.0.0.1:5098`, opts into `IsolatedPreview=true` with a fresh GUID-named temporary file campaign on every launch. It contains no credentials. Supply distinct process-local `Teams__0__Key` and `Teams__1__Key` values (24+ characters) through the IDE's inherited environment before starting it; never commit keys to launchSettings. The preview rejects any effective `ConnectionStrings:Deepfield` or `SavePath` configuration before constructing a store or registering the turn worker. Remove inherited values for a future preview run; do not point this mode at an existing campaign. Restarting creates a new disposable preview; normal non-preview storage behavior is unchanged. Stop if port 5098 is already in use. The profile does not open a browser automatically, install HTTPS certificates or modify networking.

This is prepared configuration, not a successful run. Do not stop port 5080, change its environment or reuse its save. No automatic merge, deployment or service installation is part of the solution-file increment.

## Verified for this increment
The normal SDK command above built all four projects successfully with zero warnings/errors (10.89 seconds). The frontend TypeScript/Vite build passed. A static comparison confirmed both solutions reference the same four existing projects, and the new launch-profile JSON parsed with loopback port 5098 and the legacy LocalTest flag disabled. Visual Studio IDE opening/building and application execution remain untested; no compatible IDE was detected, and the known Windows block remains. No game binary or check executable was run.

After this build, the emitted API DLL has SHA256 840C27D1858E77A0F8344E89B3A6CA5FF145CB2C22F8CC514547FC9750EA7415, different from the previously blocked build recorded above. This new binary has not been executed or confirmed accepted by Windows. A changed build hash is not evidence that the existing policy issue is resolved; no launch retry was made.

## Preview storage review correction

Nine static wiring checks pass via `node tests/preview-storage-source.mjs`. Eight C# policy checks and two startup regression cases (`node tests/preview-startup.mjs`) were authored but remain UNRUN while .NET execution is paused. Startup cases require rejection before any database use and assert an existing sentinel save stays unchanged. This revision has source/static validation only; earlier build evidence above predates this correction.

Later compile-only follow-up: the unchanged preview guard from PR #7 was compiled on downstream fleet-validation head 73c00a4 with all four projects succeeding, zero warnings/errors (8.27 seconds). Nine static wiring checks also passed. The eight C# policy checks and two process-startup tests remain unrun; no Deepfield executable was launched.

## Run turn in the isolated preview

The explicit IsolatedPreview profile now grants Run turn in Development even when LocalTest is false. The server still requires authenticated direct loopback traffic with a local hostname and no forwarding headers. Normal campaigns without either opt-in do not expose acceleration; Production never enables it.

This checkout is on feature/preview-run-turn. Local launchSettings key edits and .vs files were preserved and are not committed. When ready to replace only your Visual Studio preview, stop that debugging session, run `npm.cmd run build --prefix web` from Deepfield-scouts, then Build Solution and start the Deepfield isolated preview profile. Open http://127.0.0.1:5098 directly and refresh the page. Keep your existing locally configured keys. The profile creates a fresh disposable campaign on each launch; restarting does not resume the prior preview. Do not stop or rebuild the separate original port 5080 game.

Under Field reports, Run turn resolves all clans' committed orders immediately through the normal simultaneous resolver, then reloads the campaign and reports. Commit any draft first, or explicitly discard it with Refresh clan orders. Uncommitted drafts and pending submissions disable Run turn; the control never submits orders for you. The expected turn protects duplicate requests and races with the daily worker. An uncertain failure can be retried against the same displayed turn.

The normal output build encountered DLLs locked by Visual Studio and Deepfield.Api. A compile-only build to temporary artifacts succeeded; no process was stopped and those temporary assemblies were not executed. Runtime verification remains pending. If Windows blocks loading the rebuilt preview, stop there rather than changing security or using another launch path.
## Editing an unsubmitted maneuver

Locally added draft rows offer Edit. The dialog prefills source, action, destination, hull, count and mission where relevant. Save replaces that row in place; it does not submit orders. Cancel, Escape, Close and browser Back leave the original row unchanged. Movement availability excludes the row being edited while retaining all other draft reservations. Changing source, hull or action recalculates validation, including budget, ownership, scout availability and construction limits.

Server-loaded committed rows have no Edit action. Pending submissions disable editing. Save checks the latest turn and clan revision; a changed turn/revision requires cancelling and refreshing instead of applying an outdated edit. Refreshing or leaving the session invalidates pending editor responses. Local draft identity is never sent to the API.

This is a frontend-only change. In the existing isolated preview, reload the page after preserving any work you intend to keep, add a new draft maneuver, then choose Edit beside it. Reloading discards unsubmitted browser state. No server restart, save migration or key change is required for this editor.
