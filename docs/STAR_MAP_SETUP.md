# Star map setup preview — slice 2

Slice 2 exposes the deterministic generator from Slice 1 as a local host tool. It remains separate from the live campaign creation path.

## Host workflow

1. Start a Development local-test or isolated-preview session and sign in with a configured team key.
2. Open **Configure star map preview** in the Local Test Mode panel.
3. Choose the seed, system and player counts, map dimensions, minimum separation and local-link count.
4. Generate the preview. Homeworlds are highlighted and listed beneath the connected route map.

The same settings and seed return the exact same versioned snapshot. **New seed** only chooses another seed before requesting the same deterministic generator.

## Safety boundary

- `POST /api/local/star-map/preview` uses the existing authenticated local-preview boundary.
- It returns 404 unless Development local-test or isolated-preview capability is enabled and the request is directly loopback with a local hostname.
- Generation is pure: the endpoint never opens the campaign store and cannot change the current save.
- Validation remains server-owned. Invalid or physically impossible configurations return the existing rule-conflict response.
- The dialog deliberately has no **Create campaign** action. Locking a generated snapshot into a new campaign belongs to a later slice.
- Spacekit and WebGL are not dependencies of this preview; it renders the generator contract as an accessible SVG.

## Verification

The browser component check covers default generation, edited seed replay display, server-style validation feedback, focus restoration and mobile containment. The live smoke harness covers exact API replay, invalid-preview non-mutation, capability denial and isolated-preview access.
