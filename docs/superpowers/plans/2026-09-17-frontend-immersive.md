# Frontend Immersive Implementation Plan

**Goal:** Apply the approved illustrated direction to the web frontend.

**Architecture:** Keep existing pages and authentication. Share a small artwork
manifest and scoped stylesheet between public components and auth backgrounds.
Teacher console keeps its data components and receives shell-only styling.

**Tech Stack:** React 18, Vite, Tailwind, Radix, Lucide, Vitest.

## Tasks

- [x] Add failing render tests in `frontend/src/components/immersive.test.ts` for
  the TrailUp heading and visible illustrated background.
- [x] Import selected optimized Downloads/Design artwork into
  `frontend/src/assets/design/` and define `frontend/src/lib/design-art.ts`.
- [x] Rework `Hero`, `Header`, `Features`, `BrainHexShowcase`, `Download`, `Footer`
  and homepage composition. Keep real routes, accessible menu and profile controls.
- [x] Add `frontend/src/styles/immersive.css`; share an `AuthScenery` component
  with login/signup and add restrained console styles without touching data logic.
- [x] Run `npm test -- --maxWorkers=1`, `npx tsc --noEmit -p tsconfig.app.json`
  and scoped ESLint. Inspect desktop/mobile browser screenshots and interactions.
- [x] Update the project graph if disk space permits and report any validation
  blocked by the nearly full disk. Reuse the existing frontend server on port 8080.

## Results

- 25 test files / 239 tests passed with one worker. Seven guides have distinct
  art; the default guide, profile tabs and mobile menu semantics are covered.
- Production Vite build passed; existing vendor chunk-size warning remains.
- Scoped ESLint and `git diff --check` passed.
- TypeScript check remains blocked by existing Supabase schema mismatches in
  console/topic code, including missing `professor.geracao_automatica` typing.
- Desktop and 390x844 Chrome screenshots checked: landscape, guide selection,
  matching scenery, mobile navigation, footer and login. Fixed the Radix
  description warning and initial hash navigation after the lazy route mounts.
- Browser plugin had no available browser; used Computer Use for screenshots
  and interactions. No Playwright run, native build or dependency install.
- Teacher console styling changed only at the shell; authenticated data views
  were not visually tested without a logged-in professor session.
- `nice -n 10 graphify update .` completed. Existing port 8080 server reused.

## Follow-up: Grounded Guides and Auth Logo

- Each guide now shares a fixed 4:5 composition with its profile-specific
  foreground terrain from Downloads/Design. Foot baselines are calibrated per
  scene, with contact shadows; text height no longer shifts the ground.
- Removed the logo frame from the shared login/student/professor signup brand.
- Regression tests failed before the changes, then passed. Full suite: 241
  passing tests in 25 files; scoped lint, production build and diff check passed.
- Desktop screenshot confirms the guide on its stone platform. Follow-up
  mobile screenshots were not completed because the user was using Chrome.

## Follow-up: Scene Continuity

The user requested closer adherence to the supplied fantasy references and
continuous transitions. Keep the approved purple/coral/turquoise direction,
seven guide identities, real links and the unframed auth logo.

- [x] Import selected wide landscapes with the existing single-process Magick
  workflow in `scripts/import-web-landscapes.mjs`; retain source artwork.
- [x] Add render regressions for a single terrain per guide, the shared opening
  composition and illustrated feature scenery. Observe failures before edits.
- [x] Update `Hero`, `Features`, `BrainHexShowcase`, `Download` and `Index`:
  brighter forest opening, compact editorial features, one full-width panorama
  per guide, landscape closing. Remove the portrait-on-panorama collage.
- [x] Replace conflicting CSS rules in `immersive.css`, not append overrides.
  Scale guide and ground together, blend scene boundaries into one shared ink
  color, maintain mobile/desktop reading order, support reduced motion.
- [x] Run single-worker tests, scoped lint, build and diff check. Inspect page
  transitions and guide foot placement on desktop/mobile where tools permit.

### Continuity Verification

- The two new render regressions failed before implementation, then passed.
  Full suite: 243 tests in 25 files; scoped ESLint and production build passed.
  Existing vendor bundle size warning remains.
- Browser plugin still exposed no browsers. Used cached Playwright with a
  separate headless browser, without installing dependencies or touching the
  user's open Chrome tabs. Closed the test browser after verification.
- Inspected full-page 1440x1000 and 390x844 screenshots, plus 320x568 and
  1920x1080 framing. The next section is visible from the opening on small
  and wide screens. No horizontal overflow or missing images observed.
- Checked all seven guide panoramas on desktop and their geometry on mobile:
  the 16:9 ground and guide stay in the same coordinate space; feet remain
  above the description. Contact shadows follow the single-foot/duo poses.
- Verified mobile menu close/hash scroll, keyboard profile selection and
  unframed logos on login and both signup routes. No page errors observed.
- One screenshot write hit the machine's low-disk condition; remaining
  captures used smaller JPEG files. No user files or native builds changed.

## Follow-up: Mobile Guide Framing

- Reproduced on the public web page at 375x667: the 1000px minimum scene
  width produced a 562.5px-tall panorama. The guide's feet ended at y=835
  after navigating to the profile section, outside the visible phone screen.
  The earlier checks only established that the guide fit horizontally.
- Mobile scene width now responds to both viewport dimensions, with enough
  horizontal coverage around the guide's focal point. Ground and guide still
  scale together. Seven accessible emblem tabs now occupy a single row;
  desktop labels and scene dimensions remain unchanged.
- A browser assertion for the entire guide plus 24px of ground failed before
  the fix and passed afterward for all seven profiles at 320x568, 375x667,
  390x844 and 430x932. Also checked side margins, separation from copy,
  edge-to-edge scenery, and absence of horizontal overflow in all 28 cases.
- Inspected mobile screenshots and verified unchanged 1440x1000 desktop
  dimensions in isolated Chromium. No native device test or Safari run:
  the compatible cached WebKit executable was unavailable. No installs.
- The 11 focused render tests and scoped ESLint passed.

## Follow-up: One Background per Guide

- Found the second visible background outside the guide component: the
  previous section's forest extended 190px into the profile section on
  mobile. The download section also overlapped the guide by 64px on desktop.
- Confined feature artwork to its own section, gave the guide section an
  opaque isolated background, and removed the download's negative margin.
  Kept the selected profile's single panorama, guide scale and floor position.
- Browser checks passed for seven profiles at 320px, 390px and 1440px:
  exactly one guide panorama, no neighboring scenery overlap, no horizontal
  overflow, and guide art within the viewport. Inspected mobile/desktop
  screenshots. The 11 focused render tests passed.
