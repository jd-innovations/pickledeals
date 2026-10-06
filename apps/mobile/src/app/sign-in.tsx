import type { AuthIntent } from '@pickledeals/shared';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useTheme } from '@/design/theme';
import {
  AuthCanceled,
  authErrorMessage,
  isAppleSignInAvailable,
  isGoogleSignInAvailable,
  sendEmailCode,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
} from '@/features/auth/api';
import { GoogleMark } from '@/features/auth/GoogleMark';
import { INTENT_COPY, useAuth } from '@/features/auth/authStore';
import { supabase } from '@/lib/supabase';
import { Button, Text, TextField } from '@/ui';

type Step = 'choose' | 'email' | 'code';
const CODE_LENGTH = 6;

/** D6 auth sheet (formSheet): Sign in with Apple or Google, or a 6-digit email code, then resume the intent. */
export default function SignInSheet() {
  const { intent } = useLocalSearchParams<{ intent?: AuthIntent }>();
  const { scheme } = useTheme();
  const resumeAfterSignIn = useAuth((s) => s.resumeAfterSignIn);
  const cancel = useAuth((s) => s.cancel);

  const [step, setStep] = useState<Step>('choose');
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable, () => setAppleAvailable(false));
  }, []);

  useEffect(
    () => () => {
      // Swiping the sheet away abandons the pending action.
      if (!useAuth.getState().user) cancel();
    },
    [cancel],
  );

  const run = async (task: () => Promise<void>, onDone?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      onDone?.();
    } catch (e) {
      if (!(e instanceof AuthCanceled)) setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onApple = () => run(signInWithApple, resumeAfterSignIn);
  const onGoogle = () => run(signInWithGoogle, resumeAfterSignIn);
  const googleAvailable = isGoogleSignInAvailable();
  const onSendCode = () =>
    run(
      () => sendEmailCode(email),
      () => setStep('code'),
    );
  const onVerify = (value = code) => run(() => verifyEmailCode(email, value), resumeAfterSignIn);

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH && !busy) onVerify(digits);
  };

  const subtitle =
    step === 'code'
      ? `Enter the ${CODE_LENGTH}-digit code we sent to ${email.trim()}.`
      : intent
        ? INTENT_COPY[intent]
        : 'Save products, set price alerts, sell gear and message players.';

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 32, gap: 14 }}>
      <Text variant="title1">{step === 'code' ? 'Check your email' : 'Sign in'}</Text>
      <Text variant="body" tone="secondary">
        {subtitle}
      </Text>

      {!supabase ? (
        <Text variant="footnote" tone="secondary">
          Sign-in is unavailable: Supabase isn’t configured for this build.
        </Text>
      ) : step === 'choose' ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={27}
              style={{ height: 54, opacity: busy ? 0.4 : 1 }}
              onPress={busy ? () => {} : onApple}
            />
          )}
          {googleAvailable && <Button label="Continue with Google" variant="outline" leading={<GoogleMark />} onPress={onGoogle} disabled={busy} fullWidth />}
          <Button
            label="Continue with email"
            variant={appleAvailable || googleAvailable ? 'secondary' : 'primary'}
            onPress={() => setStep('email')}
            disabled={busy}
            fullWidth
          />
        </View>
      ) : step === 'email' ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={onSendCode}
            error={error}
          />
          <Button label="Send code" onPress={onSendCode} loading={busy} disabled={!email.includes('@')} fullWidth />
          <Button
            label="Back"
            variant="link"
            size="sm"
            onPress={() => {
              setError(null);
              setStep('choose');
            }}
          />
        </View>
      ) : (
        <View style={{ gap: 12, marginTop: 8 }}>
          <TextField
            label="Code"
            value={code}
            onChangeText={onCodeChange}
            placeholder="123456"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            autoFocus
            style={{ fontSize: 22, letterSpacing: 6, fontVariant: ['tabular-nums'] }}
            error={error}
          />
          <Button label="Verify" onPress={() => onVerify()} loading={busy} disabled={code.length !== CODE_LENGTH} fullWidth />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
            <Button label="Resend code" variant="link" size="sm" disabled={busy} onPress={() => run(() => sendEmailCode(email))} />
            <Button
              label="Change email"
              variant="link"
              size="sm"
              onPress={() => {
                setCode('');
                setError(null);
                setStep('email');
              }}
            />
          </View>
        </View>
      )}

      {step === 'choose' && error ? (
        <Text variant="footnote" weight="600" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Text variant="caption" weight="400" tone="tertiary" align="center" style={{ marginTop: 'auto' }}>
        Browsing never requires an account.
      </Text>
    </ScrollView>
  );
}
