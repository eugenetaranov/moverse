## ADDED Requirements

### Requirement: Per-model parameter table

The printer stack SHALL source model-dependent print parameters — printhead width in pixels, dpi (dots per mm), label-type map, and print-flow variant — from a per-model registry rather than hardcoded constants. The print routine SHALL use the selected model's parameters when rendering and sending a label.

#### Scenario: Print uses the model's printhead width

- **WHEN** a label is printed to a model whose printhead is 96px wide
- **THEN** the raster is generated and sent using 96px rows, not a hardcoded 384px width

#### Scenario: Parameters are read from the registry

- **WHEN** a supported model is selected
- **THEN** its width, dpi, label-type map, and print-flow variant come from the model registry entry

### Requirement: Model detection

The selected model SHALL be determined by detecting it from the connected device — by anchored name match and, where it disambiguates, by fields in the status response — rather than assuming a single fixed model.

#### Scenario: Detect model from device

- **WHEN** a supported Niimbot printer connects
- **THEN** its model is detected and the corresponding registry entry is selected

### Requirement: Safe fallback for unrecognized models

When a connected Niimbot device cannot be matched to a registry entry, the stack SHALL fall back to conservative default parameters and surface an "unverified model" indication rather than failing hard or silently sending parameters known to corrupt output on that head.

#### Scenario: Unknown model falls back with a note

- **WHEN** a Niimbot device connects but its model is not in the registry
- **THEN** the stack uses safe default parameters and indicates the model is unverified rather than erroring out

### Requirement: Support claimed only for tested models

The registry SHALL only mark as supported the models that have been physically verified; other models are treated as unverified (handled by the fallback requirement) and SHALL NOT be presented as confirmed-supported.

#### Scenario: Untested model is not claimed as supported

- **WHEN** a model has not been physically tested
- **THEN** it is not listed among confirmed-supported models and is handled via the unverified fallback path
