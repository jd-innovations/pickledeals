import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';

import { useTheme } from '@/design/theme';

type Props = ScrollViewProps & { footer: ReactNode; children: ReactNode };

/**
 * Scrolling sheet body with a pinned action bar. In a multi-detent formSheet the content isn't
 * re-laid out to the visible height, so a footer stacked below a ScrollView can cover its last
 * section. Here the footer floats over the bottom and the content is padded by the footer's measured
 * height, so the last section always scrolls clear of it at any detent or text size.
 */
export function SheetScroll({ footer, children, contentContainerStyle, ...rest }: Props) {
  const { colors } = useTheme();
  const [footerHeight, setFooterHeight] = useState(96);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        {...rest}
        scrollIndicatorInsets={{ bottom: footerHeight }}
        contentContainerStyle={[contentContainerStyle, { paddingBottom: footerHeight + 20 }]}>
        {children}
      </ScrollView>
      <View
        onLayout={(e) => setFooterHeight(Math.ceil(e.nativeEvent.layout.height))}
        style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.separator }]}>
        {footer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
});
