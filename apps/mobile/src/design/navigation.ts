import { useTheme } from './theme';

/**
 * Native stack defaults for every tab: iOS large titles, no hairline, token backgrounds.
 * No headerStyle background: on iOS 26 a solid header colour hides the large title and leaves a blank
 * band (react-native-screens#3100). The system header over `contentStyle` looks the same.
 */
export function useStackOptions() {
  const { colors } = useTheme();
  return {
    headerLargeTitle: true,
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
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
