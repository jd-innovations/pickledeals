import { Alert } from 'react-native';

export type DialogAction = { text: string; onPress: () => void; destructive?: boolean };

/** Native confirm: resolves true when the user picks `confirmLabel`. */
export function confirm(title: string, message: string, confirmLabel: string, destructive = false): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}

/** A short list of actions (iOS alert with buttons, plus Cancel). */
export function chooseAction(title: string, actions: DialogAction[]) {
  Alert.alert(title, undefined, [...actions.map((a) => ({ text: a.text, onPress: a.onPress, style: a.destructive ? ('destructive' as const) : ('default' as const) })), { text: 'Cancel', style: 'cancel' }]);
}
