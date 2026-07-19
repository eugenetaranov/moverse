import { BleManager } from "react-native-ble-plx";

// One BleManager for the whole app. react-native-ble-plx expects a single
// central instance; multiple managers fight over scanning and make concurrent
// connections (multi-printer) unreliable. Every transport shares this.
let mgr: BleManager | null = null;

export function bleManager(): BleManager {
  if (!mgr) mgr = new BleManager();
  return mgr;
}
