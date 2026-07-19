# Design — multi-printer with per-printer roles

## Relationship to `printer-connect-flow`

`printer-connect-flow` (sibling pending change) makes discovery robust and adds
per-model parameters and human error states — but keeps **one** connection. This
change generalizes that single connection into a **set** and layers **roles +
routing** on top. Concretely it depends on two things that change delivers:

- `detectModel(name, statusResp?)` + the model registry (`niimbot/models.ts`) — so
  a managed printer knows its `width_px` / `dpi` and can render the right raster.
- The device-picker `scan()` → `connectTo(deviceId)` split — this change calls
  `connectTo` repeatedly to build the set instead of once.

If `printer-connect-flow` has not landed when this is implemented, its model
registry and scan/connect split are prerequisites and must be pulled in first;
the tasks below assume they exist.

## Data model

```ts
type LabelKind = "item" | "box";
type PrinterRole = LabelKind | "any";   // what a printer is allowed to print

interface ManagedPrinter {
  id: string;            // BLE peripheral / MAC id — stable key
  name: string;          // advertised name at connect
  model: string;         // detected model id (e.g. "b1", "d11")
  role: PrinterRole;     // persisted, keyed by id
  transport: BleTransport;
  client: NiimbotClient;
  connected: boolean;
}
```

Persistence (AsyncStorage):
- `moverse.printers` — array of `{ id, name, model }` remembered for reconnect.
- `moverse.printerRoles` — map `id -> PrinterRole`.

Kept separate so a role survives even if the remembered-set entry is pruned, and
so `printer-connect-flow`'s `moverse.lastPrinter` (single) can be migrated into
`moverse.printers` as a one-element array on first run.

## Manager replaces singleton

`connection.ts` currently exports `const printer = new PrinterConnection()` with a
single `transport`/`client`. It becomes:

```ts
class PrinterManager {
  private printers = new Map<string, ManagedPrinter>();     // by id
  list(): ManagedPrinter[]
  connectNew(deviceId): Promise<ManagedPrinter>             // add without dropping others
  disconnect(id): Promise<void>
  setRole(id, role): void                                   // persists
  printerForKind(kind: LabelKind): ManagedPrinter | null    // routing (below)
  reconnectRemembered(): Promise<void>                      // restore the set on launch
  subscribe(l): () => void                                  // emits on any set change
}
export const printers = new PrinterManager();
```

Every managed printer wires its own `transport.onDisconnect` to remove *itself*
from the map and emit — one printer dropping doesn't disturb the other.

## Routing rule (`printerForKind`)

Given the connected set and their roles, resolve a `LabelKind`:

1. Prefer a connected printer whose role **equals the kind** (exact match).
2. Else a connected printer whose role is **`any`**.
3. Among ties at the same tier, pick **deterministically** (lowest device id) so
   the same job always goes to the same printer — never "random".
4. If none, return `null` → caller enters the missing-printer recovery.

This makes the three cases fall out naturally:

| Connected set                              | item → | box → |
|--------------------------------------------|--------|-------|
| none                                       | null   | null  |
| one printer, role `any` (default)          | it     | it    |
| B1=`box`, D11=`item`                       | D11    | B1    |
| B1=`box`, D11=`box` (both box)             | null*  | B1    |
| B1=`any`, D11=`any`                        | lowest-id (with coverage hint) | lowest-id |

\* item has no printer → recovery + a Settings coverage hint. This is a **valid,
surfaced** state, not a crash.

## Why role on the printer, not on the job

The alternative — ask at print time "which printer?" — was rejected: the whole
point is that box vs item is decided by *what's being printed*, and re-choosing the
device every time is exactly the friction this removes. Roles are set once in
Settings; jobs route silently.

## Single-printer zero-config

A lone printer defaults to `any`, so a user who never opens the role UI prints both
kinds from it. The role selector only earns its place when a **second** printer
exists; until then Settings may show the role control collapsed or omitted (one
printer, role implicitly `any`). This keeps the 90% case identical to today.

## Backward-compatible print sites

Two call sites use the old global client and must move to routing:
- `Pack.tsx` item assign/print → `printers.printerForKind("item")`.
- `Settings.tsx` box-label print → `printers.printerForKind("box")`.
- `Settings.tsx` "Print test" → prints on a chosen/So-far-selected printer (test is
  per-device, so it targets the printer whose row the button sits in).

Each guards `=== null` and shows the kind-aware recovery alert.

## Render follows the routed printer

Item vs box QR-vs-text and raster width currently derive from one global
`labelSize` + `HEAD_PX`. After routing, they derive from the **selected printer's**
model width and that printer's configured label size, so a D11 item label rasters
at 96px and a B1 box label at 384px without a manual size switch.
