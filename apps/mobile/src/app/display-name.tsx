import { normalizeDisplayName, validateDisplayName, type AuthIntent, type DisplayNameError } from '@pickledeals/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { authErrorMessage } from '@/features/auth/api';
import { useAuth } from '@/features/auth/authStore';
import { updateDisplayName } from '@/features/profile/api';
import { Button, Text, TextField } from '@/ui';

const ERRORS: Record<DisplayNameError, string> = {
  too_short: 'Use at least 2 characters.',
  too_long: 'Use 40 characters or fewer.',
  invalid_characters: 'Remove special control characters.',
  reserved: 'Choose a name other than the one we generated.',
};

const INTENT_REASON: Partial<Record<AuthIntent, string>> = {
  create_listing: 'Buyers see this name on your listings.',
  message_seller: 'The seller sees this name in your conversation.',
  make_offer: 'The seller sees this name with your offer.',
};

/**
 * Public name sheet. Opened before marketplace intents when the account still has its generated
 * name, and from Profile › Edit.
 */
export default function DisplayNameSheet() {
  const { intent } = useLocalSearchParams<{ intent?: AuthIntent }>();
  const user = useAuth((s) => s.user);
  const profile = useAuth((s) => s.profile);
  const setProfile = useAuth((s) => s.setProfile);
  const resumeAfterProfile = useAuth((s) => s.resumeAfterProfile);
  const cancel = useAuth((s) => s.cancel);

  const [name, setName] = useState(profile?.nameSource === 'provided' ? profile.displayName : '');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dismissing without saving abandons the pending action.
  useEffect(() => () => cancel(), [cancel]);

  const invalid = validateDisplayName(name);
  const unchanged = profile?.nameSource === 'provided' && normalizeDisplayName(name) === profile.displayName;

  const onSave = async () => {
    setTouched(true);
    if (!user || invalid) return;
    if (unchanged) return intent ? resumeAfterProfile() : router.back();
    setBusy(true);
    setError(null);
    try {
      setProfile(await updateDisplayName(user.id, name));
      if (intent) resumeAfterProfile();
      else router.back();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 32, gap: 14 }}>
      <Text variant="title1">{intent ? 'Choose a public name' : 'Edit name'}</Text>
      <Text variant="body" tone="secondary">
        {(intent && INTENT_REASON[intent]) ?? 'Other players see this name on your listings, messages and offers.'} Your email stays private.
      </Text>
      <TextField
        label="Public name"
        value={name}
        onChangeText={setName}
        onBlur={() => setTouched(true)}
        placeholder="e.g. Dana H."
        textContentType="nickname"
        autoCapitalize="words"
        autoCorrect={false}
        autoFocus
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={onSave}
        containerStyle={{ marginTop: 8 }}
        hint="First name and last initial works well."
        error={error ?? (touched && invalid ? ERRORS[invalid] : null)}
      />
      <Button label={intent ? 'Continue' : 'Save'} onPress={onSave} loading={busy} disabled={!user || !!invalid} fullWidth />
    </ScrollView>
  );
}
