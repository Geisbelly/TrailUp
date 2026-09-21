# Web Theme Completion

Apply the already-approved illustrated direction across all frontend routes.
Each page owns one background; no old HallBackground/GradientBlobs layers.
Preserve auth, data mutations, professor authorization and profile colors.

- [x] Shared public layout, single scene, reading typography and responsive spacing.
- [x] About, blog/list/article/missing article, contact, download, legal and 404.
- [x] Recovery, reset and email confirmation use the unframed auth brand.
- [x] Console shell: responsive navigation, one restrained background, readable surfaces.
- [x] Replace hardcoded neutral blue editor/dialog surfaces with theme tokens.
- [x] Keep all console sections and make the topic editor usable on narrow screens.
- [x] Focused regressions, complete single-worker tests, scoped lint, production build.
- [x] Browser checks across routes and mobile/desktop; isolated console fixtures only.
- [x] Update repository graph after implementation, without dependency installs.

## Verification

- Vitest: 253 tests passed across 26 files, one worker.
- Vite production build passed; existing vendor chunk-size warning remains.
- Scoped ESLint: no errors; existing Fast Refresh and hook dependency warnings unchanged.
- Public/auth routes checked at 320, 390 and 1440 pixels: one background, no document overflow or page errors.
- Blog search and article navigation exercised; contact submission intercepted locally, no email sent.
- Console dashboard, trails, classes, rankings, profile, personalizations and materials checked with isolated fixtures.
- Owner-only approvals tested with simulated owner/non-owner identities; real auth and permissions untouched.
- Fixed mobile filter/tab overflow, topic editor form width and canvas zoom appearing above the editor.
- Screenshot review: public page, guide scene, console desktop/mobile and editor mobile.
- Live account mutations, generated media downloads and end-to-end email authentication were not exercised.
- Existing dev server remains at http://localhost:8080; isolated browser closed after checks.
- Repository graph updated successfully (AST only, no API calls).
