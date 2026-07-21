import AsyncStorage from "@react-native-async-storage/async-storage";

// The box the user is currently packing into, persisted so relaunching the app
// resumes the same target box instead of forcing a re-pick every session. Only
// the box code is persisted; a pending codeless "new box" (none mode, no code
// until save) is intentionally not restored across restarts.
const KEY = "moverse.currentBox";

export async function loadCurrentBox(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function saveCurrentBox(boxCode: string): Promise<void> {
  try {
    const trimmed = boxCode.trim();
    if (trimmed) await AsyncStorage.setItem(KEY, trimmed);
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // best effort
  }
}
