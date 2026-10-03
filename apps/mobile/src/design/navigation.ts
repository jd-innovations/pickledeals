import { useTheme } from './theme';

/** Native stack defaults for every tab: iOS large titles, no hairline, token backgrounds. */
export function useStackOptions() {
  const { colors } = useTheme();
  return {
    headerLargeTitle: true,
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.textPrimary,
    headerTitleStyle: { color: colors.textPrimary },
    headerLargeTitleStyle: { color: colors.textPrimary },
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: colors.background },
  };
}

/** Sheet presentations shared by stacks (formSheet with grabber, token corner radius). */
export const sheetOptions = (detents: number[]) => ({
  presentation: 'formSheet' as const,
  headerShown: false,
  sheetAllowedDetents: detents,
  sheetGrabberVisible: true,
  sheetCornerRadius: 28,
});
