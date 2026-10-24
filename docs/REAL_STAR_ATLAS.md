# Optional real star atlas — slice 4

The command deck's **Real star atlas** opens an independent view of 24 nearby Milky Way planet hosts and 31 confirmed planets. It uses Spacekit.js to render a selected star and orbiting planet markers. This view does not alter generator version 1, campaign links, orders, clan visibility, or saved campaigns.

The checked-in [`realSystems.json`](../web/src/realSystems.json) is a pinned snapshot of the [NASA Exoplanet Archive Planetary Systems Composite Parameters table](https://exoplanet.ipac.caltech.edu/docs/TAP/usingTAP.html), retrieved on 2026-10-21. It includes host right ascension, declination, and distance from the Sun, plus planet orbital period, semimajor axis, and available radius. Run `node scripts/refresh-real-systems.mjs` from the repository root to refresh it explicitly; catalog changes should be reviewed before committing a new snapshot.

The sky chart projects equatorial coordinates into a 2D disc and compresses distance logarithmically so nearby systems can be selected. It is a browseable atlas, not a physical route or travel-time map. The Spacekit view uses catalog orbital periods and semimajor axes, with compressed displayed orbit sizes. Orbital paths are circular and starting phases are illustrative because the pinned fields do not contain complete orbital elements. Planet colors and marker sizes are illustrative. No population, mineral resources, or defenses are inferred from astronomy data.

This slice deliberately keeps the real atlas separate from generated campaigns. A later campaign mode could use a versioned catalog snapshot to set system identities and distances, then define gameplay links and visibility without changing existing saves.
