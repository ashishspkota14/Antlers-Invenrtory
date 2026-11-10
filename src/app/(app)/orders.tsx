import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useTheme, type Theme } from '@/lib/theme';
import { AREA_LABEL, fmt, num, timeLabel, type Area, type WeeklyOrder } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type ToOrder = { id: number; name: string; unit: string; need: number; area: Area };
type Row = ({ kind: 'todo' } & ToOrder) | ({ kind: 'done' } & WeeklyOrder);
type Section = { key: string; title: string; data: Row[] };

/** Everything with Need above 0. Ticking saves it to this week's orders and resets Need to 0. */
export default function OrdersScreen() {
  const t = useTheme();
  const s = styles(t);
  const { canEdit } = useAuth();
  const [toOrder, setToOrder] = useState<ToOrder[]>([]);
  const [ordered, setOrdered] = useState<WeeklyOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [items, week] = await Promise.all([
      supabase
        .from('items')
        .select('id, name, unit, need, sort_order, categories!inner(area, sort_order)')
        .gt('need', 0)
        .order('sort_order'),
      supabase.rpc('current_week_start'),
    ]);
    if (items.data) {
      type Row = { id: number; name: string; unit: string; need: string; categories: { area: Area; sort_order: number } };
      const rows = (items.data as unknown as Row[])
        .sort((a, b) => a.categories.sort_order - b.categories.sort_order)
        .map((r) => ({ id: r.id, name: r.name, unit: r.unit, need: num(r.need), area: r.categories.area }));
      setToOrder(rows);
    }
    if (week.data) {
      const { data } = await supabase
        .from('weekly_orders')
        .select('id, item_name, unit, qty, ordered_at, orderer:profiles!weekly_orders_ordered_by_fkey(name)')
        .eq('week_start', week.data as string)
        .order('ordered_at', { ascending: false });
      setOrdered(((data ?? []) as unknown as WeeklyOrder[]).map((o) => ({ ...o, qty: num(o.qty) })));
    }
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_orders' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function tick(item: ToOrder) {
    setBusyId(item.id);
    const { error } = await supabase.rpc('mark_ordered', { p_item_id: item.id });
    setBusyId(null);
    if (error) Alert.alert('Not saved', error.message);
    else load();
  }

  const sections: Section[] = [
    ...(['bar', 'floor'] as Area[])
      .map((a) => ({
        key: a,
        title: `To order · ${AREA_LABEL[a]}`,
        data: toOrder.filter((i) => i.area === a).map((i): Row => ({ kind: 'todo', ...i })),
      }))
      .filter((sec) => sec.data.length > 0),
    ...(ordered.length
      ? [{ key: 'done', title: 'Ordered this week', data: ordered.map((o): Row => ({ kind: 'done', ...o })) }]
      : []),
  ];

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Orders</Text>
        <Text style={s.sub}>
          {toOrder.length === 0 ? 'Nothing left to order.' : `${toOrder.length} item${toOrder.length === 1 ? '' : 's'} to order`}
        </Text>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(i) => `${i.kind}-${i.id}`}
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
          <Text style={s.section}>{section.title}</Text>
        )}
        renderItem={({ item }) =>
          item.kind === 'todo' ? (
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                <Text style={s.meta}>
                  Need {fmt(item.need)} {item.unit}
                </Text>
              </View>
              {canEdit && (
                <Pressable
                  style={[s.tick, busyId === item.id && { opacity: 0.5 }]}
                  disabled={busyId === item.id}
                  onPress={() => tick(item)}
                >
                  <Text style={s.tickText}>Mark ordered</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={[s.name, { color: t.muted }]}>✓ {item.item_name}</Text>
                <Text style={s.meta}>
                  {fmt(item.qty)} {item.unit} · {timeLabel(item.ordered_at)}
                  {item.orderer?.name ? ` · ${item.orderer.name}` : ''}
                </Text>
              </View>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
    title: { color: t.text, fontSize: 30, fontWeight: '800' },
    sub: { color: t.muted, fontSize: 14, marginTop: 4 },
    section: {
      color: t.text,
      fontSize: 16,
      fontWeight: '800',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: t.bg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: t.card,
      borderBottomColor: t.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    name: { color: t.text, fontSize: 16 },
    meta: { color: t.muted, fontSize: 13, marginTop: 2 },
    tick: { backgroundColor: t.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
    tickText: { color: '#fff', fontWeight: '700' },
  });
