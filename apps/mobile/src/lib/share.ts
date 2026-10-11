import { shareUrl, type ShareTarget } from '@pickledeals/shared';
import { Platform, Share } from 'react-native';

/**
 * Opens the share sheet with a smart link (pickledeals.app/p|d|l|b/…): it opens the app when it's
 * installed and a preview page otherwise. iOS takes the link separately so Messages shows a preview card.
 */
export function shareItem(target: ShareTarget, text: string): void {
  const url = shareUrl(target);
  Share.share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text}\n${url}` }).catch(() => {});
}
