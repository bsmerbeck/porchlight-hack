# HyperFrames Composition Brief: Porchlight

## Objective
A 26.5s brag video dramatizing one grandparent-scam call caught by Porchlight:
ring -> screening -> verifying with the real family -> SCAM BLOCKED (red) -> VERIFIED flip (green) -> stat + close.

## Output
- `composition/` -> `porchlight.mp4` (1920x1080, 30fps, 795 frames)
- `composition-vertical/` -> `porchlight-vertical.mp4` (1080x1920)
- Stills: `brag.jpg` (SCAM BLOCKED @16.2s), `porchlight-vertical.jpg`
- HyperFrames pinned to 0.8.43. Render: `npx hyperframes@0.8.43 render -o ../porchlight.mp4 -w 4`

## Source material
- Tokens from `apps/web/src/index.css` (dark scope): bg oklch(0.16 0.01 60), surface oklch(0.20 0.012 60),
  surface-2 oklch(0.24 0.014 60), amber/idle/verifying oklch(0.80 0.15 75), screening oklch(0.70 0.12 240),
  verified oklch(0.75 0.17 150), scam oklch(0.64 0.22 25). Font: Geist (woff2 bundled in assets/fonts).
- Lamp: `apps/web/src/components/porch/LampGlow.tsx` reproduced path-for-path as static SVG
  (halo + glass radial gradients); one copy per state color, crossfaded by opacity.

## Structure (single root timeline "main")
| Clip | Time | Content |
|---|---|---|
| #bg | 0-21.2 | room glow layers (amber/blue/red/green), lamp stack, state pills |
| #s1 | 0-4.6 | unknown caller card, typed transcript plea |
| #s2 | 4.6-9.6 | caller line 2, risk 0->95, 4 tactic chips |
| #s3 | 9.6-14.2 | family phone "Is this you calling?", tap No |
| #s4 | 14.2-18.4 | SCAM BLOCKED, red flood |
| #s4b | 18.4-21.2 | VERIFIED, green flip |
| #s5 | 21.2-26.5 | $4.9B stat, wordmark + tagline + URL |

Layout differs only in the `<style id="layout">` block (lamp box, pills, panel, glow center)
plus root/viewport dimensions. Seek-safe: counters drive textContent, finite repeats only.

## Audio
Template music bed (fade in 0-0.9s, out 25.5-26.5s, vol 0.28) + template SFX (bong rings,
rollover chip pops, click on tap, heavy bell on SCAM BLOCKED and on the close).
Audio-reactive glow uses the template's pre-extracted RMS (covers first 22s only; holds after).
