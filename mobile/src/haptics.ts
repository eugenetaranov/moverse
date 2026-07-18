import * as Haptics from "expo-haptics";

// Eyes-off confirmation for the capture loop. All best-effort — never throw.
export const buzzOk = () =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
export const buzzErr = () =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
export const tap = () =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
