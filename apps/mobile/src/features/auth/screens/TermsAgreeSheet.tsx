import { LEGAL_URLS, TERMS_VERSION, type AuthIntent } from '@pickledeals/shared';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { authErrorMessage } from '@/features/auth/api';
import { useAuth } from '@/features/auth/authStore';
import { acceptTerms } from '@/features/profile/api';
import { haptic } from '@/lib/haptics';
import { Button, Text } from '@/ui';

const INTENT_ACTION: Partial<Record<AuthIntent, string>> = {
  create_listing: 'Before you post your first listing',
  message_seller: 'Before you send your first message',
  make_offer: 'Before you make your first offer',
};

/**
 * One-time agreement to the Terms of Use before posting (App Store Guideline 1.2: users agree to terms
 * that forbid objectionable content and abusive users). Recorded per terms version.
 */
export default function TermsAgreeSheet() {
  const { intent } = useLocalSearchParams<{ intent?: AuthIntent }>();
  const { colors } = useTheme();
  const profile = useAuth((s) => s.profile);
  const setProfile = useAuth((s) => s.setProfile);
  const resumeAfterTerms = useAuth((s) => s.resumeAfterTerms);
  const cancel = useAuth((s) => s.cancel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dismissing without agreeing abandons the pending action.
  useEffect(
    () => () => {
      if (useAuth.getState().profile?.termsVersion !== TERMS_VERSION) cancel();
    },
    [cancel],
  );

  const onAgree = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      await acceptTerms(TERMS_VERSION);
      haptic.success();
      setProfile({ ...profile, termsVersion: TERMS_VERSION });
      resumeAfterTerms();
    } catch (e) {
      haptic.error();
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const rules = [
    'Be accurate: list only gear you have and can sell.',
    'No harassment, threats, hate, scams, spam or explicit content.',
    'No prohibited items, such as weapons, drugs, counterfeit or stolen goods.',
    'Meet in public places and check items before you pay.',
  ];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 32, gap: 14 }}>
      <Text variant="title1">Community rules</Text>
      <Text variant="body" tone="secondary">
        {(intent && INTENT_ACTION[intent]) ?? 'Before you post'}, please agree to the PickleDeals Terms of Use. We have zero tolerance for
        objectionable content and abusive users.
      </Text>
      <View style={{ gap: 10, padding: 16, borderRadius: 16, backgroundColor: colors.surface }}>
        {rules.map((r) => (
          <Text key={r} variant="subhead" weight="400">
            {'•  '}
            {r}
          </Text>
        ))}
      </View>
      <Text variant="footnote" tone="secondary">
        You can report or block anyone from the app. We review reports within 24 hours and remove content or accounts that break the rules.
      </Text>
      <Button label="Read the Terms of Use" variant="link" size="sm" onPress={() => WebBrowser.openBrowserAsync(LEGAL_URLS.terms)} />
      {error ? (
        <Text variant="footnote" style={{ color: colors.textPrimary }}>
          {error}
        </Text>
      ) : null}
      <Button label="I agree" onPress={onAgree} loading={busy} disabled={!profile} fullWidth />
    </ScrollView>
  );
}
