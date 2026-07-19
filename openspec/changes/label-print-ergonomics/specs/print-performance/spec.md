## ADDED Requirements

### Requirement: Fast image-row streaming

The image-row stream SHALL NOT be gated on a per-chunk acknowledged BLE write.
Rows SHALL be sent with write-without-response, paced by a periodic flow-control /
check-line sync (every N rows) rather than an acknowledgement on every chunk, so a
dense full-label bitmap prints quickly. The change SHALL preserve print correctness:
the setup sequence, per-third pixel counts, row-repeat cap, and end-of-page
handshake are unchanged.

#### Scenario: Test print is not gated per chunk

- **WHEN** a dense test label is printed
- **THEN** its rows stream without waiting for an acknowledgement on every chunk, and the label prints correctly

#### Scenario: Test print speed comparable to a normal print

- **WHEN** a test label and a normal item label of the same label size are printed
- **THEN** the test print completes in time comparable to the normal print, rather than being dramatically slower

### Requirement: Right-sized test image

The test image SHALL be sized to the target label and no larger than necessary, so
no time is spent streaming rows beyond the label.

#### Scenario: Test image matches the label

- **WHEN** a test print runs for a given label size
- **THEN** the generated test bitmap matches that label's pixel dimensions rather than a larger fixed size
