import AsyncStorage from "@react-native-async-storage/async-storage";
import { getScope } from "./scope";
import { userKey } from "./userState";

// The box the user is currently packing into, persisted so relaunching the app
// resumes the same target box instead of forcing a re-pick every session. Only
// the box code is persisted; a pending codeless "new box" (none mode, no code
// until save) is intentionally not restored across restarts. Kept per user and
// job: switching jobs must never pack into another job's box.
function key(): string | null {
  const s = getScope();
  return s ? userKey(s.userId, `currentBox.${s.jobId}`) : null;
}

export async function loadCurrentBox(): Promise<string> {
  const KEY = key();
  if (!KEY) return "";
  try {
    return (await AsyncStorage.getItem(KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function saveCurrentBox(boxCode: string): Promise<void> {
  const KEY = key();
  if (!KEY) return;
  try {
    const trimmed = boxCode.trim();
    if (trimmed) await AsyncStorage.setItem(KEY, trimmed);
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // best effort
  }
}
