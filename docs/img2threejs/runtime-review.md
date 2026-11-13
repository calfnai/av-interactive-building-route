# Foxtail lily runtime review

The supplied source is a mixed bouquet image. The left high foxtail spike is readable, but the crop is only 360 × 760 px and its lower attachment is occluded by another bloom. The reference was therefore admitted as **conditional**: the runtime is a procedural spatial interpretation, not an exact botanical reconstruction.

The generated Creator-side factory is recorded at `generatedFoxtailLilyFactory.ts`; the playable runtime is the smaller code-only factory in `src/stairs/foxtailLily.ts`. Its named groups are `stem`, `spike`, `florets`, `leaves`, and `halo`. The groups are clickable through the scene raycaster, and the selected flower can be locally deconstructed.

Evidence:

- Reference crop: `foxtail-lily-reference.jpg`
- Layered analysis: `analysis.md`
- Pre-spec assessment: `assessment.json`
- Detail inventory: `detail-inventory.json`
- Strict sculpt contract: `foxtail-lily-object-sculpt-spec.json`
- Material evidence: `material-evidence/`
- Generated factory evidence: `generatedFoxtailLilyFactory.ts`
- Browser review captures: `flora-walk-browser.png`, `sound-wall-browser.png`

The browser captures cover both variants and the overview/debug camera. Runtime interaction and the audio fallback were additionally checked with the local browser session. Exact single-flower fidelity remains gated on a future near-field reference image, as required by the intake decision.
