// Per-user local state (platform-foundation D10). Everything tied to a user —
// current org/job, code pools, current box — lives under one key prefix so
// sign-out can wipe it in one sweep. Device settings (printer, label size,
// labeling mode) stay unprefixed: they belong to the phone, not the person.
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "moverse.u.";

export function userKey(userId: string, name: string): string {
  return `${PREFIX}${userId}.${name}`;
}

export async function wipeUserState(userId: string): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const mine = keys.filter((k) => k.startsWith(`${PREFIX}${userId}.`));
  if (mine.length) await AsyncStorage.multiRemove(mine);
}
