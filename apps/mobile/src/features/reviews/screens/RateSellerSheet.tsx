import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { confirm } from '@/lib/dialog';
import { Button, Icon, IconButton, Skeleton, Text, TextField } from '@/ui';

import { StarPicker } from '../components';
import type { MyReview } from '../api';
import { useMyReview, useReviewMutations } from '../hooks';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

/**
 * Rate seller (formSheet). Opened from the "How was buying…" notification or email, or the Rate
 * seller button on the sold line in the chat. Only the linked buyer can write, for 30 days.
 */
export default function RateSellerSheet() {
  const { listing = '' } = useLocalSearchParams<{ listing: string }>();
  const signedIn = useAuth((s) => !!s.user);
  const requireAuth = useAuth((s) => s.requireAuth);
  const { data, isPending, isError, refetch } = useMyReview(listing);

  if (!signedIn) {
    return (
      <View style={{ padding: 20, gap: 16 }}>
        {header('Rate your purchase', 'Sign in with the account you bought with.')}
        <Button label="Sign in" onPress={() => requireAuth('rate_seller', () => refetch())} />
      </View>
    );
  }
  if (isPending) {
    return (
      <View style={{ padding: 20, gap: 14 }}>
        <Skeleton height={28} width={220} />
        <Skeleton height={56} />
        <Skeleton height={96} />
      </View>
    );
  }
  if (isError || !data) {
    return (
      <View style={{ padding: 20, gap: 16 }}>
        {header('Nothing to rate', isError ? 'Couldn’t load this purchase. Try again in a moment.' : 'Only the buyer the seller linked to this sale can rate it.')}
        <Button label={isError ? 'Try again' : 'Done'} onPress={() => (isError ? refetch() : router.back())} />
      </View>
    );
  }

  const subtitle = `${data.title} from ${data.sellerName}`;
  if (!data.open) {
    return (
      <View style={{ padding: 20, gap: 16 }}>
        {header(data.review ? 'Your review' : 'Reviews are closed', subtitle)}
        <Text variant="subhead" weight="400" tone="secondary">
          Reviews can be written or changed for 30 days after the sale.
        </Text>
        <Button label="Done" onPress={() => router.back()} />
      </View>
    );
  }
  return <ReviewForm data={data} subtitle={subtitle} />;
}

function header(title: string, subtitle?: string): ReactNode {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="title3" weight="700">
          {title}
        </Text>
        {!!subtitle && (
          <Text variant="subhead" weight="400" tone="secondary">
            {subtitle}
          </Text>
        )}
      </View>
      <IconButton icon="close" label="Close" size={32} tone="surface" onPress={() => router.back()} />
    </View>
  );
}

/** The form starts from the saved review, if there is one. */
function ReviewForm({ data, subtitle }: { data: MyReview; subtitle: string }) {
  const { colors } = useTheme();
  const { submit, remove } = useReviewMutations(data.listingId, data.sellerId);
  const [rating, setRating] = useState(data.review?.rating ?? 0);
  const [body, setBody] = useState(data.review?.body ?? '');
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <View style={{ padding: 24, gap: 16, alignItems: 'center' }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.interactive, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={24} color={colors.onInteractive} weight="bold" />
        </View>
        <Text variant="title3" weight="700" align="center">
          Thanks for the review
        </Text>
        <Text variant="subhead" weight="400" tone="secondary" align="center">
          It’s on {data.sellerName}’s profile now. You can change it until {day(data.closesAt)}.
        </Text>
        <Button label="Done" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  const save = () =>
    submit.mutate(
      { rating, body },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setDone(true);
        },
      },
    );

  const del = async () => {
    if (await confirm('Delete your review?', 'It comes off the seller’s profile. You can write a new one until the window closes.', 'Delete', true)) {
      remove.mutate(undefined, { onSuccess: () => router.back() });
    }
  };

  const error = submit.error ?? remove.error;
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
      {header(data.review ? 'Edit your review' : `How was buying from ${data.sellerName}?`, subtitle)}
      <StarPicker value={rating} onChange={setRating} />
      <TextField
        label="Tell other players about it (optional)"
        value={body}
        onChangeText={setBody}
        maxLength={500}
        multiline
        placeholder="Item as described? Easy to deal with?"
        hint={`${body.length}/500 · Shown on ${data.sellerName}’s profile with your name`}
      />
      {data.review?.hidden && (
        <Text variant="footnote" tone="secondary">
          This review was hidden by PickleDeals after a report.
        </Text>
      )}
      {error && (
        <Text variant="footnote" weight="600">
          {error.message || 'Couldn’t save the review.'}
        </Text>
      )}
      <Button label={data.review ? 'Save changes' : 'Post review'} disabled={!rating} loading={submit.isPending} onPress={save} />
      {data.review && <Button label="Delete review" variant="link" size="sm" loading={remove.isPending} onPress={del} />}
      <Text variant="caption" weight="400" tone="tertiary" align="center">
        You can change it until {day(data.closesAt)}.
      </Text>
    </ScrollView>
  );
}
