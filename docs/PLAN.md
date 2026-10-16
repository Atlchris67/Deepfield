# Deepfield MVP

Original family space strategy, managed by Nova. One persistent campaign, two clans with original Federation / Empire identities. Provisional: each clan shares one homeworld, treasury and orders; members coordinate on a private board. Empire may be AI-controlled. No borrowed franchise assets.

## Vertical slice
1. Pure deterministic seeded C# rules: small linked galaxy, reconnaissance, colony expeditions, ship construction, simultaneous combat, energy collectors and reachable Type III abstraction.
2. ASP.NET Core: team bearer keys supplied by the local operator, visibility-filtered views, versioned order replacement, private messages, persisted daily deadline and transactional resolution. AI uses the same view and order validation.
3. React/TypeScript command deck: galaxy, orders, reports, private board and local test controls.
4. Automated rules / API / persistence checks, frontend build and browser inspection, then feature-branch publication. Empty repository needs an explicit base initialization decision before a draft PR can exist.

## Invariants and scope
- Daily turns are simultaneous. Resolve at most one overdue turn; next deadline is 24 hours after actual resolution (no outage catch-up cascade).
- Save state, turn, reports and deadline together. Serialize order submission and resolution; persist idempotency receipts. Reject stale revisions, unknown/illegal orders, late orders and hidden targets.
- AI gets no hidden ownership, fleets, resources or enemy orders. Deterministic initiative breaks otherwise equal combat results only through mutual destruction.
- Local accelerated mode requires Development, explicit opt-in and a loopback client. No DNS, tunnels, firewall, accounts, persistent services, deployment or machine-wide installation.
- PostgreSQL is intended persistence. A file store is an explicit local-development fallback, with an exclusive lock and atomic replacement. Neither team keys nor campaign saves belong in Git.
- No license selected. Authentication is a small operator-provisioned team-key MVP, not production account management. No public hosting until account/access review.

## Acceptance checks
Rules and deterministic replay; AI legal orders; visibility isolation; deadline boundary; duplicate submission and mismatched retry; stale revisions; concurrent resolution; persisted restart / overdue behavior; private board/API isolation; production test-mode denial; build/typecheck and local browser smoke.

## Isolated preview Run turn increment

Expose Run turn when the server grants explicit local acceleration: Development plus IsolatedPreview or the existing LocalTest opt-in, loopback address/hostname and no forwarding headers. Retain authentication, transactional expected-turn checks and the normal resolver. Label the action as committed-orders-only; never submit a local draft implicitly. Preserve local launchSettings keys and .vs files without staging them.

Stages: (1) checkpoint scope; (2) wire preview capability, clear UI semantics and regression coverage; (3) run safe frontend checks and compile-only backend validation, document any runtime block, publish a draft PR. Verify duplicate/scheduler attempts, normal-mode denial, refresh/report behavior and unsubmitted draft handling. Do not launch Deepfield binaries while the existing execution pause remains unresolved.

## Local-only draft maneuver editing

Add Edit for locally added, unsubmitted draft items only. Prefill a modal, replace the same item on Save, preserve its local identity/order, and leave it unchanged on Cancel/Escape/close. Exclude only the edited item from reservations and retain other draft orders for validation. Guard repeated saves, pending submissions, changed turn/revision and leaving the session. Server-loaded committed items are not editable. Preserve local launch settings/keys and Visual Studio files.

Implement on a new local branch from PR10, add pure and actual-React interaction regressions, then run aggregate frontend tests/lint/build. Local commits only; no push, PR or publication is authorized for this increment.
