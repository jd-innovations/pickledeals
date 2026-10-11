import { appRouteForLink } from '@pickledeals/shared';

/**
 * Smart links (pickledeals.app/p|d|l|b/…, and /open from notification emails) arrive as universal
 * links; send each to its screen. Anything else passes through unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return appRouteForLink(path) ?? path;
  } catch {
    return path;
  }
}
