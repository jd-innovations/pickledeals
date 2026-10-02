import { formatPrice } from '@pickledeals/shared';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTheme } from '@/design/theme';
import { Text } from '@/ui';

export type ChartPoint = { day: string; cents: number };

const shortDate = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Price history line (design: Product › Price history, Price history screen). Monochrome: the line
 * is the primary text colour, "typical" is a dashed tertiary rule, the low is a hollow marker and
 * today is a filled dot. `interactive` adds scrubbing with a selection haptic per day.
 */
export function PriceChart({
  points,
  typicalCents,
  height = 140,
  interactive = false,
  onScrub,
}: {
  points: ChartPoint[];
  typicalCents?: number | null;
  height?: number;
  interactive?: boolean;
  onScrub?: (point: ChartPoint | null) => void;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const padTop = 12;
  const padBottom = interactive ? 22 : 8;
  const plotH = height - padTop - padBottom;

  const geo = useMemo(() => {
    if (points.length < 2 || width === 0) return null;
    const values = points.map((p) => p.cents).concat(typicalCents ? [typicalCents] : []);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, 1);
    const x = (i: number) => (i / (points.length - 1)) * width;
    const y = (c: number) => padTop + (1 - (c - min) / span) * plotH;
    // Step line: prices hold until they change.
    let d = `M0 ${y(points[0]!.cents)}`;
    points.forEach((p, i) => {
      if (i === 0) return;
      d += ` H${x(i)} V${y(p.cents)}`;
    });
    const lowIndex = points.reduce((best, p, i) => (p.cents < points[best]!.cents ? i : best), 0);
    return { d, x, y, lowIndex, min, max };
  }, [points, typicalCents, width, plotH]);

  const indexAt = (px: number) => Math.max(0, Math.min(points.length - 1, Math.round((px / Math.max(width, 1)) * (points.length - 1))));
  // The gesture is rebuilt each render, so `active` is current: one haptic per day crossed.
  const scrub = (px: number) => {
    const i = indexAt(px);
    if (i !== active) {
      Haptics.selectionAsync().catch(() => {});
      setActive(i);
      onScrub?.(points[i] ?? null);
    }
  };
  const end = () => {
    setActive(null);
    onScrub?.(null);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => scrub(e.x))
    .onUpdate((e) => scrub(e.x))
    .onFinalize(end);

  const last = points[points.length - 1];
  const low = geo ? points[geo.lowIndex] : undefined;
  const chart = (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        last && low ? `Price history. Now ${formatPrice(last.cents)}. Low ${formatPrice(low.cents)} on ${shortDate(low.day)}.` : 'Price history'
      }>
      {geo && (
        <Svg width={width} height={height}>
          {typicalCents ? (
            <Line x1={0} x2={width} y1={geo.y(typicalCents)} y2={geo.y(typicalCents)} stroke={colors.textTertiary} strokeWidth={1} strokeDasharray="3 4" />
          ) : null}
          <Path d={geo.d} stroke={colors.textPrimary} strokeWidth={2} fill="none" strokeLinejoin="round" />
          <Circle cx={geo.x(geo.lowIndex)} cy={geo.y(low!.cents)} r={4.5} fill={colors.background} stroke={colors.textPrimary} strokeWidth={2} />
          <Circle cx={geo.x(points.length - 1)} cy={geo.y(last!.cents)} r={4.5} fill={colors.textPrimary} />
          {active != null && (
            <>
              <Line x1={geo.x(active)} x2={geo.x(active)} y1={padTop - 6} y2={padTop + plotH} stroke={colors.textPrimary} strokeWidth={1} />
              <Circle cx={geo.x(active)} cy={geo.y(points[active]!.cents)} r={5} fill={colors.textPrimary} />
            </>
          )}
        </Svg>
      )}
      {interactive && points.length > 1 && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' }} pointerEvents="none">
          <Text variant="caption" weight="400" tone="tertiary">
            {shortDate(points[0]!.day)}
          </Text>
          <Text variant="caption" weight="400" tone="tertiary">
            Today
          </Text>
        </View>
      )}
    </View>
  );

  return interactive ? <GestureDetector gesture={pan}>{chart}</GestureDetector> : chart;
}

export { shortDate };
