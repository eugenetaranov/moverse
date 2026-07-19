# box-label-content Specification

## Purpose
TBD - created by archiving change box-label-qr-content. Update Purpose after archive.
## Requirements
### Requirement: Configurable box-label QR content

A box label's QR content SHALL be configurable between the box code and a URL. When
set to URL, the app SHALL encode a user-provided URL template, substituting an
optional `{code}` placeholder with the box code; when the template has no
placeholder, the URL SHALL be encoded as-is. The default SHALL be the box code. The
human-readable box code SHALL always print as text on the label regardless of the QR
content choice.

#### Scenario: QR encodes the box code by default

- **WHEN** the QR content is left at its default and a box label is printed on a QR-capable label
- **THEN** the QR encodes the box code and the box code is also printed as text

#### Scenario: QR encodes a URL with the box code substituted

- **WHEN** the QR content is set to a URL template containing `{code}` and a box label is printed
- **THEN** the QR encodes the URL with `{code}` replaced by the box code, and the box code still prints as text

#### Scenario: QR encodes a plain URL

- **WHEN** the QR content is a URL template with no `{code}` placeholder
- **THEN** the QR encodes that URL as-is

### Requirement: QR-content choice offered only when it applies

The QR-content control SHALL be enabled only when a connected printer assigned box
labels has a QR-capable (large enough) label size and has passed a test print.
Otherwise the control SHALL be disabled with a short explanation, because the setting
would have no visible effect.

#### Scenario: Control enabled for a tested large-label box printer

- **WHEN** a box-role printer with a QR-capable label is connected and has passed a test print
- **THEN** the QR-content control is enabled

#### Scenario: Control disabled without a suitable printer

- **WHEN** no connected box-role printer has a QR-capable label and a passed test print
- **THEN** the QR-content control is disabled with a note explaining the requirement

### Requirement: Small-label text-only fallback

When the box printer's label is too small for a QR, the label SHALL print the box id
and the user's extra text with no QR, and the QR-content setting SHALL NOT be applied.

#### Scenario: Small box label prints text only

- **WHEN** a box label is printed on a label too small for a QR
- **THEN** the label shows the box id and the extra text, with no QR code

