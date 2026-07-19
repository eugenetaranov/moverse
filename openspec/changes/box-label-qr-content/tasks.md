## 1. Setting + payload

- [ ] 1.1 Add `BoxQrContent = { mode: "code" | "url", urlTemplate: string }` with load/save (`moverse.boxQrContent`) in `labelSettings.ts`; default `{ mode: "code", urlTemplate: "" }`
- [ ] 1.2 Add a `resolveBoxQrPayload(setting, boxCode)` helper: `code` → boxCode; `url` → template with `{code}` substituted (as-is if no placeholder)

## 2. Rendering

- [ ] 2.1 Change `renderBoxLabel` to accept the resolved QR payload string (keep box code as the printed text); keep the `!fitsQr` branch printing box id + extra text with no QR
- [ ] 2.2 Update the add-a-new-box print path (`screens/Pack.tsx`) to resolve the payload from the setting before rendering

## 3. Test-passed tracking

- [ ] 3.1 Track a per-printer "test passed" boolean, set when a test print completes without error (session state via the printer manager)

## 4. Settings UI

- [ ] 4.1 In the Box labels section, add a QR-content toggle (Box code / Link) and, when Link, a URL-template field (persisted)
- [ ] 4.2 Enable the control only when a connected box-role printer has a QR-capable label and a passed test print; disabled note otherwise
- [ ] 4.3 `npx tsc --noEmit` clean; commit, push, watch build; verify a `wa.me` QR scans to the link on a large label and a small label prints text-only
