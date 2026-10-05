import { dollarsToCents, LISTING_CONDITIONS, radius } from '@pickledeals/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { useBrands } from '@/features/catalog/hooks';
import { Button, Chip, SegmentedControl, Text, Toggle } from '@/ui';

import type { MarketSort } from '../api';
import { RADIUS_OPTIONS } from '../components';
import { DEFAULT_MARKET_FILTERS, filtersToQuery, useMarket, useMarketFilters, useViewer, type MarketFilters } from '../hooks';

const CATEGORIES = [
  { slug: 'paddles', label: 'Paddles' },
  { slug: 'shoes', label: 'Shoes' },
  { slug: 'bags', label: 'Bags' },
  { slug: 'ball-machines', label: 'Ball machines' },
  { slug: 'apparel', label: 'Apparel' },
  { slug: 'balls', label: 'Balls' },
  { slug: 'eyewear', label: 'Eyewear' },
  { slug: 'nets', label: 'Nets' },
  { slug: 'training', label: 'Training' },
];
const SORTS: { value: MarketSort; label: string }[] = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
];

const toDollars = (c?: number) => (c == null ? '' : String(Math.round(c / 100)));

/** Marketplace filters (formSheet, design: "Filters"). Shows the live count before applying. */
export default function MarketFiltersSheet() {
  const { colors } = useTheme();
  const current = useMarketFilters((s) => s.f);
  const areaLabel = useViewer((s) => s.label);
  const [draft, setDraft] = useState<MarketFilters>(current);
  const [min, setMin] = useState(toDollars(current.minCents));
  const [max, setMax] = useState(toDollars(current.maxCents));
  const brands = useBrands();

  const parsed: MarketFilters = {
    ...draft,
    minCents: min ? (dollarsToCents(min) ?? undefined) : undefined,
    maxCents: max ? (dollarsToCents(max) ?? undefined) : undefined,
  };
  const preview = useMarket({ ...filtersToQuery(parsed), limit: 1 });

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const apply = () => {
    useMarketFilters.getState().set(parsed);
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
              setDraft(DEFAULT_MARKET_FILTERS);
              setMin('');
              setMax('');
            }}
          />
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="headline">{areaLabel ? `Distance from ${areaLabel}` : 'Distance'}</Text>
          <SegmentedControl
            options={RADIUS_OPTIONS.map((r) => ({ value: r.label, label: r.label }))}
            value={RADIUS_OPTIONS.find((r) => r.m === draft.radiusM)?.label ?? '25 mi'}
            onChange={(v) => setDraft({ ...draft, radiusM: RADIUS_OPTIONS.find((r) => r.label === v)!.m })}
          />
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="headline">Condition</Text>
          <View style={styles.wrap}>
            {LISTING_CONDITIONS.map((c) => (
              <Chip key={c.value} label={c.label} selected={draft.conditions.includes(c.value)} onPress={() => setDraft({ ...draft, conditions: toggle(draft.conditions, c.value) })} />
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="headline">Category</Text>
          <View style={styles.wrap}>
            {CATEGORIES.map((c) => (
              <Chip key={c.slug} label={c.label} selected={draft.category === c.slug} onPress={() => setDraft({ ...draft, category: draft.category === c.slug ? null : c.slug })} />
            ))}
          </View>
        </View>

        {(brands.data?.length ?? 0) > 0 && (
          <View style={{ gap: 10 }}>
            <Text variant="headline">Brand</Text>
            <View style={styles.wrap}>
              {brands.data!.slice(0, 16).map((b) => (
                <Chip key={b.slug} label={b.name} outlined selected={draft.brands.includes(b.slug)} onPress={() => setDraft({ ...draft, brands: toggle(draft.brands, b.slug) })} />
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: 10 }}>
          <Text variant="headline">Price</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { label: 'Min', value: min, set: setMin },
              { label: 'Max', value: max, set: setMax },
            ].map((x) => (
              <View key={x.label} style={[styles.price, { backgroundColor: colors.surface }]}>
                <Text variant="footnote" tone="secondary">
                  {x.label}
                </Text>
                <Text variant="headline">$</Text>
                <TextInput
                  accessibilityLabel={`${x.label}imum price`}
                  value={x.value}
                  onChangeText={(t) => x.set(t.replace(/[^\d]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="Any"
                  placeholderTextColor={colors.textTertiary}
                  style={{ flex: 1, fontSize: 17, fontWeight: '600', color: colors.textPrimary, padding: 0, fontVariant: ['tabular-nums'] }}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={{ borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' }}>
          <View style={[styles.toggle, { borderBottomWidth: 1, borderBottomColor: colors.background }]}>
            <Text variant="subhead" weight="600">
              Local pickup only
            </Text>
            <Toggle
              accessibilityLabel="Local pickup only"
              value={draft.pickupOnly}
              onValueChange={(v) => setDraft({ ...draft, pickupOnly: v })}
            />
          </View>
          <View style={styles.toggle}>
            <Text variant="subhead" weight="600">
              Include items that ship
            </Text>
            <Toggle
              accessibilityLabel="Include items that ship"
              value={draft.includeShipping}
              onValueChange={(v) => setDraft({ ...draft, includeShipping: v })}
            />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="headline">Sort</Text>
          <SegmentedControl options={SORTS} value={draft.sort} onChange={(v) => setDraft({ ...draft, sort: v })} />
        </View>
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.separator }]}>
        <Button
          label={preview.data ? `Show ${preview.data.total} ${preview.data.total === 1 ? 'listing' : 'listings'}` : 'Show listings'}
          fullWidth
          onPress={apply}
          loading={preview.isFetching && !preview.data}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  price: { flex: 1, minHeight: 48, borderRadius: radius.control + 2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  footer: { padding: 16, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
});
