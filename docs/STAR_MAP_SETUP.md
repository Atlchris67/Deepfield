# Star map setup and new campaign - slices 2 and 3

Slice 2 exposes the deterministic generator from Slice 1 as a local host tool. Slice 3 starts a separate playable campaign from its previewed seed and settings.

## Host workflow

1. Start a Development local-test or isolated-preview session and sign in with a configured team key.
2. Open **Configure star map** in the Local Test Mode panel.
3. Choose the seed, system and player counts, map dimensions, minimum separation and local-link count.
4. Generate the preview. Homeworlds are highlighted and listed beneath the connected route map.
5. With a two-player preview displayed, choose **Start new campaign**. The command deck switches to that campaign. **Return to original campaign** switches the browser back without changing the original save.

The same settings and seed return the exact same versioned snapshot. **New seed** only chooses another seed before requesting the same deterministic generator.

## Safety boundary

- `POST /api/local/star-map/preview` uses the existing authenticated local-preview boundary.
- It returns 404 unless Development local-test or isolated-preview capability is enabled and the request is directly loopback with a local hostname.
- Generation is pure: the endpoint never opens the campaign store and cannot change the current save.
- Validation remains server-owned. Invalid or physically impossible configurations return the existing rule-conflict response.
- `POST /api/local/campaigns` accepts a stable request ID, generator version, seed and settings under the same local host guard. The server regenerates and validates the snapshot, then stores it in a separate `generated-campaigns/<id>.json` file beside the configured file-store save. Repeating the same request returns the existing campaign; reusing an ID with different settings is rejected.
- New campaigns are available only with the Development file store, exactly two players and at least four systems, matching the current rules and victory condition. The original campaign save is never replaced. The browser remembers the selected generated campaign for its current tab session.
- Generated links govern movement, scouting, map drawing, and AI planning. Existing campaigns retain their original 12-system topology. The clan API exposes route links and map dimensions, but not the full generated snapshot, hidden system names, or the other clan's current state.
- Spacekit and WebGL are not dependencies of this preview; it renders the generator contract as an accessible SVG.

## Verification

The browser component check covers edited settings invalidating the old preview, failed-generation recovery, cancel/close, repeated Start clicks, retry identity, focus restoration and mobile containment. The isolated API/browser check verifies a saved snapshot, idempotent Start, validation/permission denial, linked movement and turn resolution, return to the original campaign, and unchanged original state.
