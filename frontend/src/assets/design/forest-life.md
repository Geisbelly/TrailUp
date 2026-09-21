# Forest Life

- Asset: `forest-life.webp`, 640 x 640, transparent WebP, approximately 73 KB.
- Generated with the built-in `image_gen` tool; no CLI/API fallback.
- Style reference: `journey-dawn.webp`, from the existing Downloads/Design scenery.
- Prompt summary: transparent 2 x 2 sprite atlas matching the faceted purple
  illustrated forest. Purple/teal pointed-leaf branch in the upper-left tile;
  symmetrical gold/violet butterfly, wings open and head up, upper-right;
  isolated lilac leaf lower-left; turquoise/violet butterfly lower-right.
  Crisp angular painted shapes, genuine alpha, no backdrop, labels, borders,
  glow, text, emoji styling, or photographic textures.
- Original generated PNG: `$CODEX_HOME/generated_images/01a0a796-b211-7962-99d8-e18c8ecd9ccd/exec-01d09687-3790-4863-b50b-bede39bdee25.png`.
- Export: resized to 640 x 640, WebP quality 88, preserving alpha.

`SceneNature.tsx` shares this atlas across decorative elements. Butterfly
tiles are used only as alpha masks: both render in luminous pale yellow,
with a warm golden halo to match the butterflies in the landscape.
CSS controls wing hinges, flight paths, branch pivots, and falling leaves.
Landscape camera motion follows scrolling inside a fixed, masked frame;
there is no idle camera drift. Motion honors reduced-motion preferences and pauses
offscreen, in hidden tabs, and while an authentication form has focus.
