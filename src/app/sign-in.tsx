import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

/**
 * Invite-only sign-in with a one-time email code.
 * Accounts exist only after an owner invites the email, so new sign-ups are refused.
 */
export default function SignIn() {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) {
      setMessage(
        error.message.toLowerCase().includes('signups not allowed')
          ? 'This email has not been invited yet. Ask an owner to send you an invite.'
          : error.message,
      );
      return;
    }
    setStep('code');
    setMessage('We emailed you a sign-in code.');
  }

  async function verify() {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) setMessage('That code did not work. Check it or send a new one.');
  }

  const s = styles(t);
  const ready = step === 'email' ? /\S+@\S+\.\S+/.test(email) : code.trim().length >= 6;

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.wrap}>
        <Text style={s.brand}>ANTLERS</Text>
        <Text style={s.title}>Inventory</Text>
        <Text style={s.sub}>
          {step === 'email' ? 'Sign in with the email your invite was sent to.' : `Enter the code sent to ${email}.`}
        </Text>

        {step === 'email' ? (
          <TextInput
            style={s.input}
            placeholder="you@example.com"
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={() => ready && sendCode()}
          />
        ) : (
          <TextInput
            style={[s.input, s.code]}
            placeholder="123456"
            placeholderTextColor={t.muted}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => ready && verify()}
          />
        )}

        <Pressable
          style={[s.button, (!ready || busy) && { opacity: 0.5 }]}
          disabled={!ready || busy}
          onPress={step === 'email' ? sendCode : verify}
        >
          <Text style={s.buttonText}>{busy ? 'Please wait…' : step === 'email' ? 'Send code' : 'Sign in'}</Text>
        </Pressable>

        {step === 'code' && (
          <Pressable onPress={() => { setStep('email'); setCode(''); setMessage(null); }}>
            <Text style={s.link}>Use a different email</Text>
          </Pressable>
        )}

        {message && <Text style={s.message}>{message}</Text>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
    brand: { color: t.accent, fontSize: 15, fontWeight: '800', letterSpacing: 4 },
    title: { color: t.text, fontSize: 34, fontWeight: '800', marginTop: -6 },
    sub: { color: t.muted, fontSize: 15, marginBottom: 8 },
    input: {
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 17,
      color: t.text,
    },
    code: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
    button: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
    buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
    link: { color: t.accent, textAlign: 'center', fontSize: 15 },
    message: { color: t.muted, textAlign: 'center', fontSize: 14 },
  });
