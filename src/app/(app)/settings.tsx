import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useTheme, type Theme } from '@/lib/theme';
import type { Profile, Role } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', manager: 'Manager', user: 'User' };

export default function SettingsScreen() {
  const t = useTheme();
  const s = styles(t);
  const { profile, isOwner, signOut } = useAuth();

  const [team, setTeam] = useState<Profile[]>([]);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'user' | 'manager'>('user');
  const [sending, setSending] = useState(false);

  const loadTeam = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, email, name, role').order('role').order('name');
    setTeam((data as Profile[]) ?? []);
  }, []);

  useEffect(() => {
    if (isOwner) loadTeam();
  }, [isOwner, loadTeam]);

  async function invite() {
    setSending(true);
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email: email.trim().toLowerCase(), role: inviteRole },
    });
    setSending(false);
    if (error) {
      let msg = error.message;
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) msg = body.error;
      } catch {}
      Alert.alert('Invite not sent', msg);
      return;
    }
    Alert.alert(
      data?.status === 'updated' ? 'Role updated' : 'Invite sent',
      data?.status === 'updated'
        ? `${email} already has an account and is now a ${ROLE_LABEL[inviteRole]}.`
        : `${email} will get an email. They download the app and sign in with that email.`,
    );
    setEmail('');
    loadTeam();
  }

  async function setRole(p: Profile, role: 'user' | 'manager') {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id);
    if (error) Alert.alert('Not changed', error.message);
    loadTeam();
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Settings</Text>

        <View style={s.card}>
          <Text style={s.name}>{profile?.name}</Text>
          <Text style={s.meta}>{profile?.email}</Text>
          <Text style={[s.badge, { color: t.accent }]}>{profile ? ROLE_LABEL[profile.role] : ''}</Text>
        </View>

        {isOwner && (
          <>
            <Text style={s.section}>Invite someone</Text>
            <View style={s.card}>
              <TextInput
                style={s.input}
                placeholder="their@email.com"
                placeholderTextColor={t.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <View style={s.segment}>
                {(['user', 'manager'] as const).map((r) => (
                  <Pressable
                    key={r}
                    style={[s.segBtn, inviteRole === r && { backgroundColor: t.accent, borderColor: t.accent }]}
                    onPress={() => setInviteRole(r)}
                  >
                    <Text style={[s.segText, inviteRole === r && { color: '#fff' }]}>{ROLE_LABEL[r]}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.help}>
                {inviteRole === 'manager' ? 'Managers can change counts, edit the list and tick orders.' : 'Users can only view the counts.'}
              </Text>
              <Pressable
                style={[s.primary, (!/\S+@\S+\.\S+/.test(email) || sending) && { opacity: 0.5 }]}
                disabled={!/\S+@\S+\.\S+/.test(email) || sending}
                onPress={invite}
              >
                <Text style={s.primaryText}>{sending ? 'Sending…' : 'Send invite'}</Text>
              </Pressable>
            </View>

            <Text style={s.section}>Team</Text>
            <View style={s.card}>
              {team.map((p) => (
                <View key={p.id} style={s.member}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>{p.name || p.email}</Text>
                    <Text style={s.meta}>{p.email}</Text>
                  </View>
                  {p.role === 'owner' ? (
                    <Text style={s.ownerTag}>Owner</Text>
                  ) : (
                    <Pressable
                      style={[s.roleBtn, p.role === 'manager' && { backgroundColor: t.accentSoft, borderColor: t.accent }]}
                      onPress={() => setRole(p, p.role === 'manager' ? 'user' : 'manager')}
                    >
                      <Text style={[s.roleText, p.role === 'manager' && { color: t.accent }]}>{ROLE_LABEL[p.role]}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              <Text style={s.help}>Tap a role to switch between Manager and User.</Text>
            </View>
          </>
        )}

        <Pressable style={s.secondary} onPress={signOut}>
          <Text style={s.secondaryText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    title: { color: t.text, fontSize: 30, fontWeight: '800' },
    section: { color: t.text, fontSize: 16, fontWeight: '800', marginTop: 8 },
    card: { backgroundColor: t.card, borderRadius: 14, borderColor: t.border, borderWidth: 1, padding: 16, gap: 10 },
    name: { color: t.text, fontSize: 18, fontWeight: '700' },
    meta: { color: t.muted, fontSize: 13 },
    badge: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    input: {
      backgroundColor: t.boxBg,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: t.text,
    },
    segment: { flexDirection: 'row', gap: 8 },
    segBtn: { flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    segText: { color: t.text, fontWeight: '700' },
    help: { color: t.muted, fontSize: 13 },
    primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    member: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    memberName: { color: t.text, fontSize: 16 },
    ownerTag: { color: t.muted, fontWeight: '700' },
    roleBtn: { borderWidth: 1, borderColor: t.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
    roleText: { color: t.text, fontWeight: '700' },
    secondary: { marginTop: 16, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    secondaryText: { color: t.danger, fontSize: 16, fontWeight: '700' },
  });
