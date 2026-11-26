# Hosting Deepfield

**Status: prepared, not deployed.** Nothing in this document has been run against a cloud provider. No cloud
resource, DNS record or public address exists. The owner chooses the provider and gives the go-ahead before any
of the "Deploy" steps are carried out.

Owner decisions this implements (see [VISION.md](VISION.md)):

- Cloud hosting with HTTPS and PostgreSQL. The provider is **not chosen yet**; everything here is provider-neutral.
- Personal accounts: **email and password, by invitation**. No outside sign-in or email service is used.

## What a host must provide

| Need | Detail |
| --- | --- |
| Run one container | Built from the `Dockerfile` in the repository root. It listens on plain HTTP port 8080. |
| HTTPS in front of it | The platform's proxy/load balancer holds the certificate and forwards to port 8080. The app is not reachable any other way. |
| PostgreSQL | Any managed PostgreSQL 14 or later. One small database is enough. Automatic daily backups turned on. |
| Secret settings | A place to store the settings below without putting them in the repository. |
| Health checks | `GET /health` (process is up) and `GET /health/ready` (database answers). Both work over plain HTTP. |

Run **one instance**. Turn resolution is safe with more than one (the database row is locked), but sign-in rate
limits are kept in memory per instance.

## Settings

Set these as environment variables on the host. Never commit real values.

| Variable | Required | Meaning |
| --- | --- | --- |
| `ConnectionStrings__Deepfield` | Yes | Npgsql connection string, for example `Host=…;Port=5432;Database=deepfield;Username=…;Password=…;SSL Mode=Require`. |
| `Owner__SetupKey` | For first start | A random secret of at least 24 characters. It lets one person create the owner account, once. Remove it after setup. |
| `Proxy__TrustForwardedHeaders` | Yes, behind a proxy | `true`. The app then trusts `X-Forwarded-Proto` and `X-Forwarded-For` from the platform proxy. Only set it when the app cannot be reached except through that proxy. |
| `Proxy__ForwardLimit` | No | Number of proxies in front of the app. Default `1`. |
| `Auth__Mode` | No | `accounts` is the default outside Development. `keys` keeps the old shared clan keys and then needs `Teams__0__Key` / `Teams__1__Key`. |
| `Auth__AttemptsPerMinute` | No | Sign-in, setup, invitation and reset attempts allowed per client address per minute. Default `20`. |
| `Https__Require` | No | Defaults to `true` with accounts outside Development: plain HTTP is redirected to HTTPS and HSTS is sent. |
| `LegacyMap` | No | `true` starts a new campaign on the original fictional map instead of the real-star map. |
| `EmpireAi`, `EconomyVersion`, `CombatVersion` | No | Rules for a **new** campaign, as described in the README. They do not change an existing campaign. |

Generate a setup key in PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
```

## First start

1. The app creates its two tables (`deepfield_campaign`, `deepfield_accounts`) and a new real-star campaign.
   It never replaces a campaign that is already in the database.
2. Open the site. It shows **Create owner account**. Enter the setup key, your email, a display name, your clan
   and a password (10 characters or more).
3. Remove `Owner__SetupKey` from the host settings. Setup is already closed once an owner exists; removing the
   key is tidiness.
4. Open **Players** in the header. Create an invitation link for a clan and send it privately to the player.
   Each link works once and expires after 7 days.

## Day-to-day

- **Forgotten password:** Players → *Reset link* for that player. Send them the link. It works once, for 24 hours.
  There is no "email me a link" because no email service is connected.
- **Remove access:** Players → *Disable*. The player is signed out at once and cannot sign in.
- **Move a player to another clan:** Players → *Clan*. It applies on their next request.
- **Owner forgot their password:** there is no second owner yet. Recovery is a database operation; see below.

## What is stored, and how

- Passwords: salted PBKDF2 hashes from ASP.NET Core's `PasswordHasher`. The password itself is never stored or logged.
- Session, invitation and reset tokens: only a SHA-256 hash is stored. The token itself is shown once or kept in the browser cookie.
- Session cookie: `__Host-deepfield_session`, `Secure`, `HttpOnly`, `SameSite=Strict`, 30 days.
- Every state-changing request must carry the header `X-Deepfield-Request: 1`, which another website cannot add.
- Five wrong passwords lock that account's sign-in for 15 minutes. Signed-in sessions are not affected.
- Personal data held: email address, display name, clan, and clan-channel messages. Nothing else.

## Backup and restore

The whole game is two rows. Use the provider's automatic backups, and before any risky change take a manual copy:

```bash
pg_dump --no-owner --table=deepfield_campaign --table=deepfield_accounts "$DATABASE_URL" > deepfield-backup.sql
```

Restore into an **empty** database with `psql "$DATABASE_URL" < deepfield-backup.sql`, then start the app.
Test a restore once before inviting players.

Owner password recovery: owner setup reopens only when there are no accounts at all. So, with the app stopped,
either restore a backup, or empty the accounts row
(`UPDATE deepfield_accounts SET state='{"Schema":1,"Accounts":[],"Invitations":[],"Sessions":[],"Resets":[]}'`),
set `Owner__SetupKey` again, create the owner and re-invite the players. The campaign itself is untouched.

## Moving the current family playtest to the host

The running local playtest uses clan keys and a save file. **This milestone does not touch it.** Moving that
campaign into a hosted database is a separate, deliberate step (import the save into `deepfield_campaign` before
first start) and needs the owner's go-ahead. Until then a hosted instance starts a fresh campaign.

## Deploy (only after the owner's go-ahead)

1. Choose the provider. Create the PostgreSQL database and note its connection string.
2. Build and push the image: `docker build -t <registry>/deepfield:<version> .` then `docker push …`.
3. Create the app from that image with the settings above, HTTPS enabled, health check `/health/ready`, one instance.
4. Open the platform's default HTTPS address and do **First start**.
5. Optional: point a domain name at it and let the platform issue the certificate.
6. Take a backup, restore it into a scratch database, and confirm the restore works.

## Known limits

- The `Dockerfile` has not been built on the development machine (Docker is not installed there). The same
  publish layout was run in Production mode against PostgreSQL without Docker; see [VERIFICATION.md](VERIFICATION.md).
- One owner. No self-service password reset, no email verification, no two-factor sign-in.
- Accounts are one JSON document, like the campaign. That suits a family campaign; it must become proper tables
  before commercial scale.
- Rate limits are per instance and in memory.
- Before commercial use: privacy notice, terms, account deletion on request, and an independent security review.
