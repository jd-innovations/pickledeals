import type { DialogAction } from './dialog';

export type { DialogAction };

// react-native-web's Alert ignores buttons; the browser preview uses the built-in dialogs instead.
export function confirm(title: string, message: string, confirmLabel: string): Promise<boolean> {
  return Promise.resolve(window.confirm(`${title}\n\n${message}\n\nOK = ${confirmLabel}`));
}

export function chooseAction(title: string, actions: DialogAction[]) {
  const answer = window.prompt(`${title}\n${actions.map((a, i) => `${i + 1}. ${a.text}`).join('\n')}`, '1');
  const picked = answer ? actions[Number(answer) - 1] : undefined;
  picked?.onPress();
}
