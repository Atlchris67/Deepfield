# Deepfield vision

This page records what Deepfield is meant to become, the decisions the owner has made, and what "version 1.0" means. The [roadmap](ROADMAP.md) tracks progress against the milestones below.

## Owner decisions

These were decided by the owner and are not open for reinterpretation by contributors or coding agents. Changing one needs the owner.

| Topic | Decision |
| --- | --- |
| Audience | Family first, then commercial. The game must be fun for the family playtest before any commercial work starts. |
| Platform | Computer first. Desktop browsers are the target; phones and tablets come later. |
| Setting | Real stars and habitability are flavour only. Real star names and positions set the scene, and habitability is an advisory score. Neither is a scientific simulation. |
| Rules depth | A simple default mode plus an advanced mode. |
| Campaign length | A campaign lasts a few weeks. After that, play continues in seasons. |
| Players | Two clans now, designed so more can be added. |
| Missing players | AI fills in for players who are absent. |
| Hosting | Cloud hosting with HTTPS and PostgreSQL. |
| Identity | Personal accounts, replacing shared clan keys. |

### Open owner decisions

- **What separates simple mode from advanced mode.** Undecided. Milestone 4 cannot start until the owner settles which rules belong to each mode.

## Stars! clean-room rule

Deepfield is inspired by the 1995 game Stars!. It is an original game, not a port or a clone.

- Never copy Stars! decompiled code, extracted art, names, text or exact data tables.
- Never commit reverse-engineering material to this repository. That includes disassembly, decompiler output, memory dumps, extracted assets and notes derived from them.
- Ideas at the level of genre and mechanics are fine: simultaneous turns, exploring and colonising star systems, designing ships. Their expression here must be written fresh, with our own names, numbers and art.
- If a contribution's origin is unclear, leave it out and ask the owner.

## Version 1.0: definition of done

Version 1.0 is done when all seven milestones are complete.

1. **Protect the work and write down the plan.** Local work is committed and pushed, secrets and local files stay out of the repository, and this vision is recorded.
2. **Hosting and accounts.** The game runs in the cloud over HTTPS with PostgreSQL, and each player signs in with a personal account.
3. **Seasons and replayability.** Homeworlds and links vary between campaigns, a campaign ends with a victory screen, and a new season can be started.
4. **Simple and advanced modes.** The two modes replace today's overlapping rule versions (economy, combat, logistics and materials switches).
5. **Fill-in AI.** AI plays for any player who is missing, so a campaign never stalls.
6. **Desktop polish and recorded verification.** The desktop experience is finished, and the verification that proves it is recorded.
7. **Everything merged to main with CI.** All work is on `main`, and continuous integration runs the build and tests on every change.
