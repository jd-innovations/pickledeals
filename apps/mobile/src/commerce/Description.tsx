import type { DescriptionBlock, DescriptionRun } from '@pickledeals/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Button, Text } from '@/ui';

const PREVIEW_BLOCKS = 5;

function Runs({ runs }: { runs: DescriptionRun[] }) {
  return (
    <>
      {runs.map((r, i) =>
        r.bold ? (
          <Text key={i} variant="body" weight="700">
            {r.text}
          </Text>
        ) : (
          r.text
        ),
      )}
    </>
  );
}

/**
 * A store's product description (synced from Shopify) in the app's own type styles, in the same
 * pattern as a listing's "From the seller" text. Long descriptions open with the first few blocks.
 */
export function ProductDescription({ blocks, title = 'About' }: { blocks: DescriptionBlock[]; title?: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const long = blocks.length > PREVIEW_BLOCKS + 1;
  const shown = long && !open ? blocks.slice(0, PREVIEW_BLOCKS) : blocks;
  return (
    <View style={{ gap: 10 }}>
      <Text variant="title2" accessibilityRole="header">
        {title}
      </Text>
      {shown.map((b, i) =>
        b.kind === 'heading' ? (
          <Text key={i} variant="body" weight="700" style={{ lineHeight: 25, marginTop: i ? 4 : 0 }}>
            {b.text}
          </Text>
        ) : b.kind === 'paragraph' ? (
          <Text key={i} variant="body" style={{ lineHeight: 25 }}>
            <Runs runs={b.runs} />
          </Text>
        ) : (
          <View key={i} style={{ gap: 6 }}>
            {b.items.map((item, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: 10, paddingRight: 8 }}>
                <Text variant="body" style={{ lineHeight: 25, color: colors.textTertiary }} accessible={false}>
                  •
                </Text>
                <Text variant="body" style={{ lineHeight: 25, flex: 1 }}>
                  <Runs runs={item} />
                </Text>
              </View>
            ))}
          </View>
        ),
      )}
      {long && (
        <Button
          label={open ? 'Show less' : 'Show full description'}
          variant="link"
          size="sm"
          onPress={() => setOpen(!open)}
          style={{ alignSelf: 'flex-start' }}
        />
      )}
    </View>
  );
}
