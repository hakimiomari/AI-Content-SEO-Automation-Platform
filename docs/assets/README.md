# Motion-graphic assets

Animated SVG illustrations used by the root `README.md` and the docs. They are hand-written, dependency-free and render **inside GitHub's `<img>` sandbox**, which is stricter than a browser tab.

| File | Size (viewBox) | Used in | What moves |
| --- | --- | --- | --- |
| `hero.svg` | 1200 × 360 | README header | Gradient sweep across the title, self-typing tagline with blinking caret, drifting orbs, staggered chip row |
| `pipeline.svg` | 1200 × 260 | README "What it does" | Glowing packet travelling the 10-step journey; each node pulses as it arrives |
| `architecture.svg` | 1200 × 520 | README / ARCHITECTURE | Flowing dashed connectors, a job packet that travels API → Redis → Worker → OpenAI → PostgreSQL, labelled ports |
| `agents.svg` | 1200 × 360 | README / AI_AGENTS | Agents orbit the Orchestrator (labels stay upright), a data packet visits each agent in turn |
| `roadmap.svg` | 1200 × 200 | README / ROADMAP | Progress fill lands on Phase 1, check mark draws, shimmer loops, Phase 2 pulses "up next" |
| `divider.svg` | 1200 × 40 | Between README sections | Two counter-drifting gradient waves |

## Rules every asset follows

GitHub proxies images through Camo and renders them in an `<img>` element. Anything that needs the DOM, a network request or a script is stripped or refuses to render. To keep the animations alive:

1. **Pure SVG** — `xmlns` declared, a `viewBox`, and `width`/`height` attributes so it scales with `width="100%"`.
2. **No scripts, no `<foreignObject>`, no external fonts, images or stylesheets.** Animation is CSS `@keyframes` inside a `<style>` block and/or SMIL (`<animate>`, `<animateTransform>`, `<animateMotion>`). Both work inside `<img>`.
3. **System font stack only** — `font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"`. Where text must line up with an animation (the typing tagline), `textLength` + `lengthAdjust` pins the rendered width so the caret stays aligned on any OS.
4. **Every asset paints its own background** (`#0b1020 → #141a33` gradient) so it looks identical in GitHub's light and dark themes.
5. **Under 60 KB each.** Blur `filter`s and gradients are used sparingly; there are no embedded rasters.
6. **Palette**: violet `#7c3aed / #a78bfa`, cyan `#22d3ee`, emerald `#34d399`, pink `#f472b6`, surfaces `#121a30 / #182238`, strokes `#2a3555`, text `#e2e8f0 / #94a3b8 / #64748b`.

## How the tricks work

- **Sweeping gradient text** — a `linearGradient` with `gradientUnits="userSpaceOnUse"`, `spreadMethod="repeat"` and identical first/last stops, then `animateTransform type="translate"` on `gradientTransform`. Looping is seamless because the pattern repeats.
- **Typewriter** — the tagline sits in a `<g clip-path>` whose `<rect width>` steps through a `values` list with `calcMode="discrete"`. The caret's `x` steps through the same list offset by the text's start. `fill="freeze"` keeps the final state.
- **Packets on a path** — `<animateMotion>` with `<mpath xlink:href="#path">` reuses the visible connector as the motion path. `keyPoints`/`keyTimes` add a pause at the end so the loop has a beat. A `calcMode="discrete"` opacity animation hides the packet on legs it should not be on.
- **Nodes pulsing in sequence** — every node has its own `<animate>` with a 10 s `dur` and `keyTimes` centred on the moment the packet reaches it (`0.1 × index`), so the pulses stay in sync without JavaScript.
- **Orbiting labels that stay upright** — the group rotates `0 → 360` around the centre while each agent group counter-rotates `0 → -360` around its own centre with the same duration.
- **Flowing dashes** — `stroke-dasharray` plus a CSS `@keyframes` that moves `stroke-dashoffset` by exactly one dash period (dash + gap × 2) so the loop is seamless.
- **Shimmer** — a narrow white gradient bar slides across, clipped by a `<clipPath>` whose rect uses the *same* width animation as the progress fill.

## Editing or regenerating

There is no build step; edit the SVG by hand.

1. Open the file in any editor. Coordinates are absolute in the `viewBox` space listed above.
2. Preview in a browser (`open docs/assets/hero.svg`) **and** in a Markdown preview that uses `<img>` (VS Code's preview, or push to a branch and view on GitHub). A tab renders more than `<img>` does, so always check the second.
3. Keep the checklist above. Validate quickly:

   ```bash
   # well-formed XML, size, and forbidden constructs
   for f in docs/assets/*.svg; do
     xmllint --noout "$f" && printf '%6d bytes  %s\n' "$(wc -c <"$f")" "$f"
     grep -nE '<script|<foreignObject|@import|url\(http|<image' "$f" && echo "  forbidden construct in $f"
   done
   ```

4. If you change the timing of the pipeline packet, recompute the node `keyTimes` (`c = 0.1 × index`, ring `c → c+0.06`, fill `c → c+0.02 → c+0.15`).
5. Reference assets from Markdown with a relative path, e.g. `<img src="docs/assets/hero.svg" width="100%" alt="...">`. Give every image an `alt` — the SVGs also carry `<title>`/`<desc>` for accessibility.

Static fallbacks are not needed: when a renderer ignores animation, the first frame is a complete, readable illustration.
