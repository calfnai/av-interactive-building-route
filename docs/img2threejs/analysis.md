# Foxtail lily reference analysis

## Intake

- Target: a single tall foxtail-lily-like inflorescence selected from a mixed bouquet.
- Domain: `object`; botanical spatial event prop, not a character.
- Suitability: conditional pass. The left high spike has a readable silhouette and a dark background, but the source is a 360 x 760 crop with the lower attachment partly occluded by the bouquet.
- Intended use: real-time browser prop; clickable, explodable, and lightly animated.
- Fidelity statement: the browser model is a stylized procedural interpretation of the visible spike, not a photogrammetric or manufacturing-accurate mesh.

## Layered observation

### Overall form and silhouette

- The dominant form is an asymmetric, tapered vertical spike with a slight lateral bow.
- A narrow green stem supports a dense elongated cone-like inflorescence. The tip is rounded; the lower end disappears into other flowers.
- The visible silhouette is strongest against black in the upper two thirds. The hidden back side and the buried base are undetermined.

### Macro, meso, and micro hierarchy

- Macro: `stem`, `spike`, `leaves`, and a soft `halo` used only as a spatial-event cue.
- Meso: a curved central rachis, repeated florets distributed along the spike, and several lanceolate leaves branching from the lower stem.
- Micro: paired/bract-like floret bodies, a tapered green transition at each attachment, slight hue variation from yellow-green at the tip to darker green at the base, and sparse floating pollen points near the lower third.

### Spatial relationships

- `<spike, attaches-to, stem>` through a continuous central rachis; contact type: overlap/embed.
- `<florets, attach-to, spike>` by repeated short lateral stems; contact type: butt/overlap.
- `<leaves, branch-from, stem>` from the lower and middle stem; contact type: embed.
- `<halo, surrounds, spike>` as a non-botanical interaction layer; contact type: separate event shell.

### Materials and finish

- Stem and leaves read as matte-to-satin dielectric plant tissue: vivid green albedo, roughness approximately 0.62-0.82, low metalness, low translucency in the runtime approximation.
- Florets read as small yellow-green satin forms with darker green attachment shadows. The source lighting is baked into the photo, so the implementation uses a procedural palette rather than photo projection.
- The black background is not part of the object and is excluded from the material recipe.

### Identity-defining features

- A tall, dense, tapered spike rather than an open flower head.
- Many repeated side florets, denser toward the middle and more compact near the tip.
- A visible curved rachis and a few fine pollen-like filaments around the lower third.

### Uncertainty

- The opposite side, underside, exact botany, and true flower opening are hidden or too small to resolve.
- The lower attachment is occluded by purple flowers and foliage. The model uses a socket anchor and explicit approximation.
- No exact world scale can be inferred; runtime scale is chosen for the staircase prop and the scale is recorded in the resource manifest.

## Review targets

1. The spike must read as a tall tapered vertical silhouette from front and three-quarter views.
2. The stem must visibly curve and meet the spike without a floating gap.
3. Florets must be named, repeated, and separable rather than baked into one mesh.
4. Leaves must branch from the stem and remain attached when the model is exploded.
5. The halo must remain an interaction cue, not be mistaken for botanical geometry.

