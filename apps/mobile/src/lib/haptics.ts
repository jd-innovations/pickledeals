import * as Haptics from 'expo-haptics';

/**
 * The app's haptic vocabulary (Apple HIG), used sparingly so each one means something:
 * - `tap`: something toggled or snapped (save, follow, send, zoom, pull-to-refresh).
 * - `tick`: picking among options (chips, segments, sliders).
 * - `success` / `error`: the outcome of an action the user is waiting on.
 * Plain navigation gets none. iOS skips all of them when System Haptics is off.
 */
export const haptic = {
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  tick: () => void Haptics.selectionAsync().catch(() => {}),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};
