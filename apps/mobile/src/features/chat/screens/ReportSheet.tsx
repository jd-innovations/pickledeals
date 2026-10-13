import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { confirm } from '@/lib/dialog';
import { Button, Icon, Text, TextField } from '@/ui';

import { fileReport, type ReportReason, type ReportTarget } from '../api';
import { useChatMutations } from '../hooks';

type Reason = { value: ReportReason; label: string; detail: string };

const CONDUCT: Reason[] = [
  { value: 'scam', label: 'Scam or fraud', detail: 'Asks for payment up front, fake item, phishing' },
  { value: 'counterfeit', label: 'Counterfeit or replica', detail: 'Fake branded gear' },
  { value: 'prohibited', label: 'Not allowed on PickleDeals', detail: 'Unrelated, illegal or dangerous items' },
  { value: 'offensive', label: 'Harassment or hate', detail: 'Abusive, threatening or hateful' },
  { value: 'spam', label: 'Spam', detail: 'Repeated or misleading posts and messages' },
  { value: 'other', label: 'Something else', detail: 'Tell us below' },
];
const NOT_AS_DESCRIBED: Reason = { value: 'not_as_described', label: 'Not as described', detail: 'Wrong item, condition or photos' };

/** Deals and products: price and stock problems. "Code doesn't work" needs the code the offer showed. */
const offerReasons = (code?: string): Reason[] => [
  { value: 'wrong_price', label: 'Wrong price', detail: 'The store shows a different price' },
  ...(code ? [{ value: 'code_failed' as const, label: 'Code doesn’t work', detail: `The store didn’t accept ${code}` }] : []),
  { value: 'out_of_stock', label: 'Out of stock', detail: 'The store says it’s sold out' },
  { value: 'broken_link', label: 'Link doesn’t work', detail: 'Missing page or a different product' },
  { value: 'other', label: 'Something else', detail: 'Tell us below' },
];

const TITLES: Record<ReportTarget, string> = {
  listing: 'Report listing',
  user: 'Report seller',
  conversation: 'Report conversation',
  review: 'Report review',
  offer: 'Report a problem',
  promo: 'Report a problem',
};

/** Report sheet (App Store Guideline 1.2). Reports go to the admin moderation queue. */
export default function ReportSheet() {
  const { type = 'listing', id = '', name, user, promo, code } = useLocalSearchParams<{
    type: ReportTarget;
    id: string;
    name?: string;
    user?: string;
    /** Offers only: the promo code shown with the offer, for "Code doesn't work". */
    promo?: string;
    code?: string;
  }>();
  const { colors } = useTheme();
  const signedIn = useAuth((s) => !!s.user);
  const { block } = useChatMutations();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blockId = type === 'user' ? id : user;
  const deal = type === 'offer' || type === 'promo';
  const reasons = deal ? offerReasons(promo ? code : undefined) : type === 'listing' ? [NOT_AS_DESCRIBED, ...CONDUCT] : CONDUCT;

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      // A code that doesn't work is reported against the code, so repeats from different people add up.
      if (reason === 'code_failed' && promo) await fileReport('promo', promo, reason, details.trim() || undefined);
      else await fileReport(type, id, reason, details.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDone(true);
    } catch (e) {
      setError((e as Error).message || 'Couldn’t send the report.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={{ padding: 24, gap: 16, alignItems: 'center' }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.interactive, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={24} color={colors.onInteractive} weight="bold" />
        </View>
        <Text variant="title3" weight="700" align="center">
          Thanks for telling us
        </Text>
        <Text variant="subhead" weight="400" tone="secondary" align="center">
          {deal
            ? 'We’ll check it with the store and fix or hide it. Prices can change at the store between our checks.'
            : `Our team reviews every report. We may remove the content or the account. We won’t tell ${name ?? 'them'} who reported it.`}
        </Text>
        {blockId && signedIn && (
          <Button
            label={`Block ${name ?? 'this person'}`}
            variant="secondary"
            icon="hand"
            iconPosition="leading"
            onPress={async () => {
              if (await confirm(`Block ${name ?? 'this person'}?`, 'You won’t see each other’s messages, and they can’t contact you.', 'Block', true)) {
                block.mutate(blockId, { onSuccess: () => router.back() });
              }
            }}
            style={{ alignSelf: 'stretch' }}
          />
        )}
        <Button label="Done" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 4 }}>
        <Text variant="title3" weight="700">
          {TITLES[type]}
        </Text>
        {name && (
          <Text variant="subhead" weight="400" tone="secondary" numberOfLines={1}>
            {name}
          </Text>
        )}
      </View>
      <View accessibilityRole="radiogroup" style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        {reasons.map((r, i) => (
          <Pressable
            key={r.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: reason === r.value }}
            onPress={() => setReason(r.value)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: colors.separator,
              backgroundColor: pressed ? colors.surface : 'transparent',
            })}>
            <View style={{ flex: 1 }}>
              <Text variant="subhead" weight="600">
                {r.label}
              </Text>
              <Text variant="caption" weight="400" tone="secondary">
                {r.detail}
              </Text>
            </View>
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: reason === r.value ? 7 : 1.5, borderColor: reason === r.value ? colors.interactive : colors.border }} />
          </Pressable>
        ))}
      </View>
      <TextField label="Anything else? (optional)" value={details} onChangeText={setDetails} maxLength={500} multiline placeholder={deal ? 'What did the store show?' : 'What happened?'} />
      {error && (
        <Text variant="footnote" tone="primary" weight="600">
          {error}
        </Text>
      )}
      <Button label="Send report" disabled={!reason} loading={busy} onPress={submit} />
      {!deal && (
        <Text variant="caption" weight="400" tone="tertiary" align="center">
          In danger? Contact local emergency services first.
        </Text>
      )}
    </ScrollView>
  );
}
