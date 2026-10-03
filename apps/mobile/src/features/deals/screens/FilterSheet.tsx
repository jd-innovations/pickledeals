import { dollarsToCents, radius } from '@pickledeals/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { useBrands, useCategory } from '@/features/catalog/hooks';
import { Button, Chip, Text } from '@/ui';

import type { Deal } from '../api';
import { EMPTY_FILTERS, useDealFilters, useDealFilterStore, useDeals, type DealFilters } from '../hooks';

const KINDS: { value: Deal['kind']; label: string }[] = [
  { value: 'price_drop', label: 'Price drop' },
  { value: 'promo', label: 'Promo code' },
  { value: 'sale', label: 'Sale' },
  { value: 'editorial', label: 'Editor’s pick' },
];

const toDollars = (c?: number) => (c == null ? '' : String(Math.round(c / 100)));

/** Deal filters (formSheet). Shows the live result count before applying. */
export default function FilterSheet() {
  const { colors } = useTheme();
  const { scope = 'feed:today', category = '', brand = '' } = useLocalSearchParams<{ scope: string; category?: string; brand?: string }>();
  const current = useDealFilters(scope);
  const [draft, setDraft] = useState<DealFilters>(current);
  const [min, setMin] = useState(toDollars(current.minCents));
  const [max, setMax] = useState(toDollars(current.maxCents));

  const categoryData = useCategory(category);
  const allBrands = useBrands();
  const brandOptions = useMemo(() => {
    if (brand) return [];
    if (category) {
      const seen = new Map<string, string>();
      categoryData.data?.products.forEach((p) => seen.set(p.brand.slug, p.brand.name));
      return [...seen].map(([slug, name]) => ({ slug, name }));
    }
    return (allBrands.data ?? []).slice(0, 16).map((b) => ({ slug: b.slug, name: b.name }));
  }, [brand, category, categoryData.data, allBrands.data]);

  const parsed: DealFilters = {
    ...draft,
    minCents: min ? (dollarsToCents(min) ?? undefined) : undefined,
    maxCents: max ? (dollarsToCents(max) ?? undefined) : undefined,
  };
  const [kind, slug] = scope.split(':');
  const preview = useDeals({
    feed: kind === 'feed' ? (slug as never) : 'today',
    category: category || undefined,
    brand: brand || undefined,
    collection: kind === 'collection' ? slug : undefined,
    minCents: parsed.minCents,
    maxCents: parsed.maxCents,
    brands: parsed.brands,
    kinds: parsed.kinds,
    inStockOnly: parsed.inStockOnly,
    limit: 1,
  });

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const apply = () => {
    useDealFilterStore.getState().set(scope, parsed);
    router.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 22 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="title2">Filters</Text>
          <Button
            label="Reset"
            variant="link"
            size="sm"
            onPress={() => {
              setDraft({ ...EMPTY_FILTERS, sort: draft.sort });
              setMin('');
              setMax('');
            }}
          />
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="headline">Price</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { label: 'Min', value: min, set: setMin },
              { label: 'Max', value: max, set: setMax },
            ].map((f) => (
              <View key={f.label} style={[styles.price, { backgroundColor: colors.surface }]}>
                <Text variant="footnote" tone="secondary">
                  {f.label}
                </Text>
                <Text variant="headline">$</Text>
                <TextInput
                  accessibilityLabel={`${f.label}imum price`}
                  value={f.value}
                  onChangeText={(t) => f.set(t.replace(/[^\d]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="Any"
                  placeholderTextColor={colors.textTertiary}
                  style={{ flex: 1, fontSize: 17, fontWeight: '600', color: colors.textPrimary, padding: 0, fontVariant: ['tabular-nums'] }}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="headline">Deal type</Text>
          <View style={styles.wrap}>
            {KINDS.map((k) => (
              <Chip key={k.value} label={k.label} outlined selected={draft.kinds.includes(k.value)} onPress={() => setDraft({ ...draft, kinds: toggle(draft.kinds, k.value) })} />
            ))}
          </View>
        </View>

        {brandOptions.length > 1 && (
          <View style={{ gap: 10 }}>
            <Text variant="headline">Brand</Text>
            <View style={styles.wrap}>
              {brandOptions.map((b) => (
                <Chip key={b.slug} label={b.name} outlined selected={draft.brands.includes(b.slug)} onPress={() => setDraft({ ...draft, brands: toggle(draft.brands, b.slug) })} />
              ))}
            </View>
          </View>
        )}

        <View style={[styles.switchRow, { borderColor: colors.separator }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="headline">In stock only</Text>
            <Text variant="footnote" tone="secondary">
              Hide offers the retailer lists as out of stock.
            </Text>
          </View>
          <Switch
            accessibilityLabel="In stock only"
            value={draft.inStockOnly}
            onValueChange={(v) => setDraft({ ...draft, inStockOnly: v })}
            trackColor={{ true: colors.interactive, false: colors.border }}
          />
        </View>
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.separator }]}>
        <Button
          label={preview.data ? `Show ${preview.data.total} ${preview.data.total === 1 ? 'deal' : 'deals'}` : 'Show deals'}
          fullWidth
          onPress={apply}
          loading={preview.isFetching && !preview.data}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  price: { flex: 1, height: 48, borderRadius: radius.control + 2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  footer: { padding: 16, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
});
