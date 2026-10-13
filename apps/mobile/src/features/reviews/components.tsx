import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { PersonAvatar } from '@/commerce';
import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { avatarUrl } from '@/features/profile/avatar';
import { Button, Icon, Text } from '@/ui';

import type { ReviewSummary, SellerReview } from './api';

const month = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

/** "★ 4.8 (12)" — the average with its count; null until there's a review. */
export const ratingLine = (s: Pick<ReviewSummary, 'average' | 'count'> | undefined) =>
  s && s.count > 0 && s.average != null ? `★ ${s.average.toFixed(1)} (${s.count})` : null;

/** A row of five stars, filled up to `rating` (read-only). */
export function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={`${rating} out of 5 stars`} style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} filled={n <= rating} color={n <= rating ? colors.textPrimary : colors.textTertiary} />
      ))}
    </View>
  );
}

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

/** Tappable 1–5 stars with a word for the choice. */
export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View accessibilityRole="adjustable" accessibilityLabel="Rating" accessibilityValue={{ text: value ? `${value} of 5 stars` : 'Not rated' }} style={{ flexDirection: 'row', gap: 4 }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(Math.max(1, Math.min(5, (value || 0) + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessible={false}
            hitSlop={4}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(n);
            }}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="star" size={34} filled={n <= value} color={n <= value ? colors.textPrimary : colors.textTertiary} />
          </Pressable>
        ))}
      </View>
      <Text variant="subhead" weight="600" tone={value ? 'primary' : 'tertiary'}>
        {value ? LABELS[value] : 'Tap to rate'}
      </Text>
    </View>
  );
}

/** One review on a seller's profile. Others can report it (Guideline 1.2). */
export function ReviewRow({ r, divider }: { r: SellerReview; divider?: boolean }) {
  const { colors } = useTheme();
  const uid = useAuth((s) => s.user?.id);
  const requireAuth = useAuth((s) => s.requireAuth);
  return (
    <View style={[{ paddingVertical: 14, gap: 8 }, divider && { borderTopWidth: 1, borderTopColor: colors.separator }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <PersonAvatar name={r.reviewerName} uri={avatarUrl(r.reviewerAvatar)} size={32} />
        <View style={{ flex: 1 }}>
          <Text variant="subhead" weight="600" numberOfLines={1}>
            {r.reviewerName}
          </Text>
          <Text variant="caption" weight="400" tone="secondary" numberOfLines={1} numeric>
            {[r.item, month(r.createdAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Stars rating={r.rating} />
      </View>
      {!!r.body && <Text variant="body">{r.body}</Text>}
      {r.reviewerId !== uid && (
        <Button
          label="Report review"
          variant="link"
          size="sm"
          style={{ alignSelf: 'flex-start' }}
          onPress={() => requireAuth('report', () => router.push({ pathname: '/report', params: { type: 'review', id: r.id, name: `${r.reviewerName}’s review` } }))}
        />
      )}
    </View>
  );
}
