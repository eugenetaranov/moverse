import { PermissionsAndroid, Platform } from "react-native";

// Request the Bluetooth permissions needed to scan/connect a printer. Shared so
// every entry point (Pack, Settings, BoxDetail) asks the same way.
export async function requestBlePerms(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const perms =
    Platform.Version >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await PermissionsAndroid.requestMultiple(perms as any);
  return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}
