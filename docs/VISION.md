# Deepfield vision

This page records what Deepfield is meant to become, the decisions the owner has made, and what "version 1.0" means. The [roadmap](ROADMAP.md) tracks progress against the milestones below.

## Owner decisions

These were decided by the owner and are not open for reinterpretation by contributors or coding agents. Changing one needs the owner.

| Topic | Decision |
| --- | --- |
| Audience | Family first, then commercial. The game must be fun for the family playtest before any commercial work starts. |
| Platform | Computer first. Desktop browsers are the target; phones and tablets come later. |
| Setting | Real stars set the scene: real names and positions, not a scientific simulation. Habitability is a simulated score, and it always affects how fast a colony's inhabitants grow (decided 2026-11-27; see [MODES.md](MODES.md)). |
| Rules depth | A simple default mode plus an advanced mode. The person who starts a game chooses the mode when setting that game up; it is a per-campaign choice, not a server-wide setting. |
| Campaign length | A campaign lasts a few weeks. After that, play continues in seasons. |
| Players | Two clans now, designed so more can be added. |
| Missing players | The computer plays a clan only when the campaign owner sets that clan to computer play (decided 2026-11-26). It never steps in by itself: when players miss a turn, their clan gives no orders that turn. Computer play is for testing and for a clan nobody is playing. See [COMPUTER-PLAYER.md](COMPUTER-PLAYER.md). |
| Hosting | Cloud hosting with HTTPS and PostgreSQL. The move to a cloud provider is **postponed** (owner, 2026-11-26); the provider will be chosen when hosting resumes, so the build stays provider-neutral: one container image and a PostgreSQL connection string. Nothing is deployed without the owner's go-ahead. When hosting does go live it starts a fresh campaign; the family playtest is not moved onto it. See [HOSTING.md](HOSTING.md). |
| Inhabitants | Every colony has inhabitants in both modes. They grow faster on a more habitable world, and a colony's income rises with them (decided 2026-11-27). |
| Turn limit | A season nobody has won at its turn limit goes to the clan with more colonies, then more collectors, otherwise it is shared (confirmed 2026-11-27). Nothing is earned between seasons. |
| Identity | Personal accounts, replacing shared clan keys. Sign-in is email and password. Players join by an invitation link from the owner that is tied to a clan. Passwords are stored hashed. No outside sign-in or email service is used. |

### Open owner decisions

- **Which cloud provider.** Postponed along with the move to the cloud.

## Stars! clean-room rule

Deepfield is inspired by the 1995 game Stars!. It is an original game, not a port or a clone.

- Never copy Stars! decompiled code, extracted art, names, text or exact data tables.
- Never commit reverse-engineering material to this repository. That includes disassembly, decompiler output, memory dumps, extracted assets and notes derived from them.
- Ideas at the level of genre and mechanics are fine: simultaneous turns, exploring and colonising star systems, designing ships. Their expression here must be written fresh, with our own names, numbers and art.
- If a contribution's origin is unclear, leave it out and ask the owner.

## Version 1.0: definition of done

Version 1.0 is done when all eight milestones are complete.

1. **Protect the work and write down the plan.** Local work is committed and pushed, secrets and local files stay out of the repository, and this vision is recorded.
2. **Hosting and accounts.** The game runs in the cloud over HTTPS with PostgreSQL, and each player signs in with a personal account.
3. **Seasons and replayability.** Homeworlds and links vary between campaigns, a campaign ends with a victory screen, and a new season can be started.
4. **Simple and advanced modes.** The two modes replace today's overlapping rule versions (economy, combat, logistics and materials switches).
5. **Fill-in AI.** The campaign owner can hand any clan to the computer and take it back, and the computer plays a full season in either mode. Turns resolve at the deadline whether or not orders were sent, so a campaign never stalls.
6. **Desktop polish and recorded verification.** The desktop experience is finished, and the verification that proves it is recorded.
7. **Everything merged to main with CI.** All work is on `main`, and continuous integration runs the build and tests on every change.
8. **Tidy up for 1.0.** The open rule questions are settled, inhabitants are in the game, and the roadmap says exactly what is left.
