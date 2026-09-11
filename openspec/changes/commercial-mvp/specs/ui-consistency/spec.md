# ui-consistency Delta

## ADDED Requirements

### Requirement: Screens use the design-system tokens

Every mobile screen SHALL take its colors, typography, spacing, and radii from the design-system token set mirrored in `theme.ts` (see `design-system`), replacing any remaining literal values, so the app matches the Figma library and the web surfaces. The refinement pass SHALL restyle existing screens (states, spacing rhythm, empty states) without changing flows.

#### Scenario: Restyled screens match the library

- **WHEN** the Pack hub, Browse home, and Item detail are compared against their Figma reference layouts
- **THEN** colors, type sizes, spacing, and component styling correspond token-for-token, and no screen carries leftover pre-token literal styles

#### Scenario: New commercial screens are born on tokens

- **WHEN** the auth, invite-join, and job-switcher screens are implemented
- **THEN** they are built from the shared primitives and tokens with no bespoke styling
