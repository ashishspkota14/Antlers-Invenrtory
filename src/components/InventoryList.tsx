import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NumberPad } from '@/components/NumberPad';
import { supabase } from '@/lib/supabase';
import { useTheme, type Theme } from '@/lib/theme';
import { AREA_LABEL, fmt, num, timeLabel, type Area, type Category, type Item, type WeeklyCount } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type Editing = { item: Item; field: 'have' | 'need' } | null;

export function InventoryList({ area }: { area: Area }) {
  const t = useTheme();
  const s = styles(t);
  const { canEdit } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [count, setCount] = useState<WeeklyCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [editing, setEditing] = useState<Editing>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [cats, week] = await Promise.all([
      supabase
        .from('categories')
        .select('id, area, name, sort_order, items(id, category_id, name, unit, have, need, sort_order, updated_at)')
        .eq('area', area)
        .order('sort_order')
        .order('sort_order', { referencedTable: 'items' }),
      supabase.rpc('current_week_start'),
    ]);
    if (cats.data) {
      setCategories(
        (cats.data as Category[]).map((c) => ({
          ...c,
          items: c.items.map((i) => ({ ...i, have: num(i.have), need: num(i.need) })),
        })),
      );
    }
    if (week.data) {
      const { data } = await supabase
        .from('weekly_counts')
        .select('week_start, area, finished_at, finisher:profiles!weekly_counts_finished_by_fkey(name)')
        .eq('area', area)
        .eq('week_start', week.data as string)
        .maybeSingle();
      setCount((data as unknown as WeeklyCount) ?? null);
    }
    setLoading(false);
  }, [area]);

  // Live updates: another manager's edit shows up here within a second.
  useEffect(() => {
    load();
    const reload = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 400);
    };
    const channel = supabase
      .channel(`inventory-${area}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_counts' }, reload)
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [area, load]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map((c) => ({
        key: c.id,
        title: c.name,
        total: c.items.length,
        needCount: c.items.filter((i) => i.need > 0).length,
        data: q ? c.items.filter((i) => i.name.toLowerCase().includes(q)) : collapsed[c.id] ? [] : c.items,
      }))
      .filter((sec) => !q || sec.data.length > 0);
  }, [categories, collapsed, query]);

  const needTotal = categories.reduce((n, c) => n + c.items.filter((i) => i.need > 0).length, 0);

  async function save(value: number) {
    if (!editing) return;
    const { item, field } = editing;
    setEditing(null);
    // optimistic update
    setCategories((cs) =>
      cs.map((c) => ({ ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, [field]: value } : i)) })),
    );
    const { error } = await supabase.from('items').update({ [field]: value }).eq('id', item.id);
    if (error) {
      Alert.alert('Not saved', error.message);
      load();
    }
  }

  function finishCount() {
    Alert.alert(`Finish ${AREA_LABEL[area]} count?`, 'Owners and managers will see this week as counted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish',
        onPress: async () => {
          const { error } = await supabase.rpc('finish_count', { p_area: area });
          if (error) Alert.alert('Could not finish', error.message);
          else load();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>{AREA_LABEL[area]}</Text>
        <Text style={[s.status, count ? { color: t.good } : null]}>
          {count
            ? `Counted ${timeLabel(count.finished_at)}${count.finisher?.name ? ` by ${count.finisher.name}` : ''}`
            : 'Not counted yet this week'}
          {needTotal > 0 ? `  ·  ${needTotal} to order` : ''}
        </Text>
        <TextInput
          style={s.search}
          placeholder="Search items"
          placeholderTextColor={t.muted}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
        <View style={s.colHeads}>
          <Text style={s.colHead}>Have</Text>
          <Text style={s.colHead}>Need</Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(i) => String(i.id)}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={t.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        renderSectionHeader={({ section }) => (
          <Pressable
            style={s.section}
            onPress={() => setCollapsed((c) => ({ ...c, [section.key]: !c[section.key] }))}
          >
            <Text style={s.sectionTitle}>
              {collapsed[section.key] && !query ? '▸ ' : '▾ '}
              {section.title}
            </Text>
            <Text style={s.sectionMeta}>
              {section.needCount > 0 ? `${section.needCount} to order · ` : ''}
              {section.total}
            </Text>
          </Pressable>
        )}
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={2}>{item.name}</Text>
              <Text style={s.unit}>{item.unit}</Text>
            </View>
            <ValueBox t={t} value={item.have} disabled={!canEdit} onPress={() => setEditing({ item, field: 'have' })} />
            <ValueBox
              t={t}
              value={item.need}
              highlight={item.need > 0}
              disabled={!canEdit}
              onPress={() => setEditing({ item, field: 'need' })}
            />
          </View>
        )}
        ListFooterComponent={
          canEdit ? (
            <Pressable style={s.finish} onPress={finishCount}>
              <Text style={s.finishText}>Finish {AREA_LABEL[area]} count</Text>
            </Pressable>
          ) : (
            <Text style={s.readonly}>View only. Ask an owner if you need to edit counts.</Text>
          )
        }
      />

      <NumberPad
        visible={!!editing}
        title={editing?.item.name ?? ''}
        label={editing ? `${editing.field === 'have' ? 'Have' : 'Need'} (${editing.item.unit})` : ''}
        initial={editing ? editing.item[editing.field] : 0}
        onCancel={() => setEditing(null)}
        onSave={save}
      />
    </SafeAreaView>
  );
}

function ValueBox({
  t,
  value,
  highlight,
  disabled,
  onPress,
}: {
  t: Theme;
  value: number;
  highlight?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 64,
        height: 44,
        marginLeft: 8,
        borderRadius: 10,
        borderWidth: highlight ? 2 : 1,
        borderColor: highlight ? t.accent : t.border,
        backgroundColor: highlight ? t.accentSoft : pressed ? t.accentSoft : t.boxBg,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Text style={{ color: value === 0 ? t.muted : t.text, fontSize: 18, fontWeight: highlight ? '700' : '500' }}>
        {fmt(value)}
      </Text>
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 6 },
    title: { color: t.text, fontSize: 30, fontWeight: '800' },
    status: { color: t.muted, fontSize: 14 },
    search: {
      marginTop: 6,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: t.text,
    },
    colHeads: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 4 },
    colHead: { width: 64, marginLeft: 8, textAlign: 'center', color: t.muted, fontSize: 12, fontWeight: '700' },
    section: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: t.bg,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomColor: t.border,
      borderBottomWidth: 1,
    },
    sectionTitle: { color: t.text, fontSize: 16, fontWeight: '800' },
    sectionMeta: { color: t.muted, fontSize: 13 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: t.card,
      borderBottomColor: t.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    name: { color: t.text, fontSize: 16 },
    unit: { color: t.muted, fontSize: 12, marginTop: 2 },
    finish: { margin: 16, backgroundColor: t.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    finishText: { color: '#fff', fontSize: 17, fontWeight: '700' },
    readonly: { color: t.muted, textAlign: 'center', padding: 24 },
  });
