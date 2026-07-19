## ADDED Requirements

### Requirement: Fast image-row streaming

The image-row stream SHALL minimize BLE round-trips so a dense full-label bitmap
prints quickly. Rather than one acknowledged write (and its round-trip) per row
packet, the implementation SHALL reduce round-trips — e.g. by batching multiple row
packets into each acknowledged MTU-sized write, or by paced write-without-response
with a periodic flow-control sync. The change SHALL preserve print correctness: the
setup sequence, per-third pixel counts, row-repeat cap, and end-of-page handshake
are unchanged, and no rows are dropped. (Plain unpaced write-without-response is
known to drop rows on this hardware and MUST NOT be used without flow control.)

#### Scenario: Dense print does not pay a round-trip per row

- **WHEN** a dense test label is printed
- **THEN** its row packets are sent with far fewer BLE round-trips than one-per-row, and the label prints correctly with no dropped rows

#### Scenario: Test print speed comparable to a normal print

- **WHEN** a test label and a normal item label of the same label size are printed
- **THEN** the test print completes in time comparable to the normal print, rather than being dramatically slower

### Requirement: Right-sized test image

The test image SHALL be sized to the target label and no larger than necessary, so
no time is spent streaming rows beyond the label.

#### Scenario: Test image matches the label

- **WHEN** a test print runs for a given label size
- **THEN** the generated test bitmap matches that label's pixel dimensions rather than a larger fixed size
