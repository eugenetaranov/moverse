import AsyncStorage from "@react-native-async-storage/async-storage";

// The single user-facing axis. Everything else (print vs handwrite, QR vs text)
// is derived — from whether a printer is connected and the label size.
//   scan   — item labels are pre-made (printed sheet / rolls); scan them.
//   assign — the app assigns the next code; print it (if a printer is connected)
//            or show it to hand-write.
//   none   — no codes; just photograph into the locked box (code minted+hidden).
export type LabelingMode = "scan" | "assign" | "none";
export const DEFAULT_MODE: LabelingMode = "assign";

const MODE_KEY = "moverse.labelingMode";
const ONBOARDED_KEY = "moverse.onboarded";

export async function loadMode(): Promise<LabelingMode> {
  try {
    const raw = await AsyncStorage.getItem(MODE_KEY);
    if (raw === "scan" || raw === "assign" || raw === "none") return raw;
  } catch {
    // ignore
  }
  return DEFAULT_MODE;
}

export async function saveMode(m: LabelingMode): Promise<void> {
  try {
    await AsyncStorage.setItem(MODE_KEY, m);
  } catch {
    // best effort
  }
}

export async function isOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    // best effort
  }
}
