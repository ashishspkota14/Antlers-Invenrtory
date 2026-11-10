import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme, type Theme } from '@/lib/theme';
import { fmt } from '@/lib/types';

type Props = {
  visible: boolean;
  title: string;
  label: string; // "Have (bottle)"
  initial: number;
  onCancel: () => void;
  onSave: (value: number) => void;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

/** Full-screen number pad: the only way to change Have and Need. */
export function NumberPad({ visible, title, label, initial, onCancel, onSave }: Props) {
  const t = useTheme();
  const s = styles(t);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue(initial ? fmt(initial) : '');
  }, [visible, initial]);

  function press(k: string) {
    setValue((v) => {
      if (k === '⌫') return v.slice(0, -1);
      if (k === '.') return v.includes('.') ? v : (v || '0') + '.';
      const [, dec] = v.split('.');
      if (dec !== undefined && dec.length >= 2) return v; // two decimals max
      if (v === '0') return k;
      return v.length >= 7 ? v : v + k;
    });
  }

  const parsed = value === '' || value === '.' ? 0 : Number(value);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} presentationStyle="pageSheet">
      <SafeAreaView style={s.screen}>
        <View style={s.header}>
          <Pressable onPress={onCancel} hitSlop={12}>
            <Text style={s.cancel}>Cancel</Text>
          </Pressable>
        </View>

        <Text style={s.title} numberOfLines={2}>{title}</Text>
        <Text style={s.label}>{label}</Text>
        <Text style={s.display}>{value === '' ? '0' : value}</Text>

        <View style={s.grid}>
          {KEYS.map((k) => (
            <Pressable key={k} onPress={() => press(k)} style={({ pressed }) => [s.key, pressed && s.keyDown]}>
              <Text style={s.keyText}>{k}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={s.save} onPress={() => onSave(parsed)}>
          <Text style={s.saveText}>Save</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg, paddingHorizontal: 20 },
    header: { flexDirection: 'row', justifyContent: 'flex-start', paddingVertical: 12 },
    cancel: { color: t.accent, fontSize: 17 },
    title: { color: t.text, fontSize: 24, fontWeight: '800', marginTop: 8 },
    label: { color: t.muted, fontSize: 16, marginTop: 4 },
    display: { color: t.text, fontSize: 64, fontWeight: '300', textAlign: 'right', marginVertical: 16 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
    key: {
      width: '31%',
      aspectRatio: 1.6,
      borderRadius: 14,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyDown: { backgroundColor: t.accentSoft },
    keyText: { color: t.text, fontSize: 28, fontWeight: '500' },
    save: { marginTop: 'auto', marginBottom: 12, backgroundColor: t.accent, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
    saveText: { color: '#fff', fontSize: 19, fontWeight: '700' },
  });
