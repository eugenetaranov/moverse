import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LabelSize } from "../labelSettings";

// What kind of label a job produces, and what a printer is allowed to print.
export type LabelKind = "item" | "box";
export type PrinterRole = LabelKind | "any";

export const ROLE_LABELS: Record<PrinterRole, string> = {
  item: "Item labels",
  box: "Box labels",
  any: "Any",
};
export const ROLE_ORDER: PrinterRole[] = ["any", "item", "box"];

// A newly connected printer prints everything until the user says otherwise, so
// the single-printer case needs no configuration.
export const DEFAULT_ROLE: PrinterRole = "any";

// A printer covers a kind if it's dedicated to that kind or set to "any".
export function roleCovers(role: PrinterRole, kind: LabelKind): boolean {
  return role === kind || role === "any";
}

// --- Persistence -----------------------------------------------------------
// moverse.printers   — the remembered set for reconnect: [{ id, name, model }]
// moverse.printerRoles — id -> PrinterRole
// (migrates a legacy single moverse.lastPrinter into the set on first load)

const PRINTERS_KEY = "moverse.printers";
const ROLES_KEY = "moverse.printerRoles";
const LEGACY_LAST_KEY = "moverse.lastPrinter";

export interface RememberedPrinter {
  id: string;
  name: string;
  model: string; // model id
}

export async function loadRememberedPrinters(): Promise<RememberedPrinter[]> {
  try {
    const raw = await AsyncStorage.getItem(PRINTERS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.filter(
          (p) => p && typeof p.id === "string" && typeof p.name === "string",
        );
      }
    }
    // Migration: fold a legacy single remembered printer into the set.
    const legacy = await AsyncStorage.getItem(LEGACY_LAST_KEY);
    if (legacy) {
      const p = JSON.parse(legacy);
      if (p && typeof p.id === "string") {
        const one: RememberedPrinter = {
          id: p.id,
          name: typeof p.name === "string" ? p.name : p.id,
          model: typeof p.model === "string" ? p.model : "b1",
        };
        await saveRememberedPrinters([one]);
        return [one];
      }
    }
  } catch {
    // ignore — fall back to empty
  }
  return [];
}

export async function saveRememberedPrinters(list: RememberedPrinter[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PRINTERS_KEY, JSON.stringify(list));
  } catch {
    // best effort
  }
}

export async function loadRoles(): Promise<Record<string, PrinterRole>> {
  try {
    const raw = await AsyncStorage.getItem(ROLES_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj as Record<string, PrinterRole>;
    }
  } catch {
    // ignore
  }
  return {};
}

export async function saveRoles(roles: Record<string, PrinterRole>): Promise<void> {
  try {
    await AsyncStorage.setItem(ROLES_KEY, JSON.stringify(roles));
  } catch {
    // best effort
  }
}

// Per-printer label size (mm), keyed by device id. Each printer prints at its own
// stock size; unset ids fall back to the model's default.
const LABELS_KEY = "moverse.printerLabels";

export async function loadPrinterLabels(): Promise<Record<string, LabelSize>> {
  try {
    const raw = await AsyncStorage.getItem(LABELS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj as Record<string, LabelSize>;
    }
  } catch {
    // ignore
  }
  return {};
}

export async function savePrinterLabels(labels: Record<string, LabelSize>): Promise<void> {
  try {
    await AsyncStorage.setItem(LABELS_KEY, JSON.stringify(labels));
  } catch {
    // best effort
  }
}

// Device ids that have ever passed a test print — persisted so QR-content editing
// doesn't re-lock on every app restart (a test print is a one-time confirmation).
const TESTED_KEY = "moverse.testedPrinters";

export async function loadTestedPrinters(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(TESTED_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string");
    }
  } catch {
    // ignore
  }
  return [];
}

export async function saveTestedPrinters(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TESTED_KEY, JSON.stringify(ids));
  } catch {
    // best effort
  }
}
