# design-system Delta

## ADDED Requirements

### Requirement: Figma library as the design source of truth

The project SHALL maintain a Figma library holding the Moverse visual language: color, typography, spacing, and radius tokens (light and dark), and the core components (button, text field, card, list row, status chip, sheet/dialog, header) plus reference layouts for the report page, the landing page, and the three key mobile screens (Pack hub, Browse home, Item detail). The chosen direction SHALL be selected from at least three divergent AI-generated concept explorations before curation into the library.

#### Scenario: Direction chosen from explored concepts

- **WHEN** the visual direction is being set
- **THEN** at least three distinct AI-generated concept boards exist for the report, landing, and key mobile screens, and the selected direction is curated into the Figma library

#### Scenario: Library defines the tokens

- **WHEN** an implementer needs a color, type size, or spacing value
- **THEN** the value exists as a named token in the Figma library rather than being invented in code

### Requirement: Tokens mirrored in code on every surface

The design tokens SHALL be mirrored into code once per surface — `mobile/src/theme.ts` for the app, CSS variables/Tailwind theme for the web app — with matching token names, so all three surfaces (mobile, report, marketing) render the same palette, type scale, and spacing rhythm. Figma remains the source of truth; token changes propagate by updating the mirrored files.

#### Scenario: Surfaces agree

- **WHEN** the primary color or type scale changes in the Figma library and the mirrored token files are updated
- **THEN** mobile, the report page, and the marketing site all reflect the change with no per-screen overrides left behind

#### Scenario: No ad-hoc values

- **WHEN** new UI is implemented on any surface
- **THEN** its colors, font sizes, spacing, and radii reference the token set, not literal values
