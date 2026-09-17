# Frontend Immersive Design

Approved direction: a continuous illustrated landscape inspired by the supplied
references, using the original faceted artwork from Downloads/Design.

## Scope

- Public homepage: full-width landscape, TrailUp heading, coral primary action,
  purple base, turquoise secondary accents, contextual illustrated objects.
- Seven profile environments, emblems and guides on the homepage, as requested
  in the user's follow-up. Each guide keeps its own name, artwork and color.
- Accessible navigation, real existing routes and download links.
- Login and signup share an illustrated background without changing auth logic.
- Teacher console receives restrained brand treatments, readable solid surfaces,
  compact controls and the existing route/permission boundaries.
- Student profile colors and personalization logic remain unchanged.

## Implementation Boundaries

Use React, Tailwind, Radix and Lucide already installed. Import only selected
optimized assets derived from Downloads/Design; preserve their original colors.
Keep the public layout scoped so teacher data views do not inherit hero styling.
No new dependencies, native build, generated images, WebGL or background loops.

## Verification

Render tests for homepage semantics, all seven guides, distinct profile art,
navigation and CTA destinations. Typecheck and focused lint. Inspect desktop and
mobile layouts in the browser, including menu, profile selection and auth pages.
Respect reduced motion, keyboard navigation, readable contrast and image sizing.
