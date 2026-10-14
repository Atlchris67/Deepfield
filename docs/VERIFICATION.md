# Verification — 2026-10-14, Piedmont

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
