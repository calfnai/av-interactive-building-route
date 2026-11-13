# Resonance panel CAD validation

Source: `models/cad/resonance_panel.py` using the text-to-cad `scripts/step` target.

- Primary artifact: `models/cad/resonance_panel.step`
- Web sidecar: `src/assets/cad/resonance_panel.glb` (native GLB derived from STEP)
- Browser copy: `public/models/cad/resonance_panel.glb`
- Nominal dimensions: 900 × 2100 × 80 mm
- Inspected bounds: `[-450, -45, -1050]` to `[450, 35, 1050]` mm
- Inspected size: `[900, 80, 2100]` mm
- Geometry facts: part, 1 shape, 124 faces, 336 edges
- Four mounting cutters use 8 mm diameter and 70 mm edge offset.
- Snapshot: `docs/cad-resonance-panel_20260813T205629Z.png`

The geometry facts and snapshot were produced after the final STEP regeneration. The web runtime scales the GLB by `0.001`, preserving the requested `1 unit = 1 metre` scene convention. `GLTFLoader` success is surfaced in the UI as `CAD GLB READY`; a procedural fallback remains available if the sidecar fails to load.
