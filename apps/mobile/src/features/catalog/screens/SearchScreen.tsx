import { formatPrice } from '@pickledeals/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandRow, ProductRow } from '@/commerce';
import { useTheme } from '@/design/theme';
import { Chip, EmptyState, Icon, SearchField, Skeleton, Text } from '@/ui';

import { openBrand, openCategory, openProduct } from '../components';
import { productImage, useCatalogSearch, useCategories, useRecentSearches } from '../hooks';

/** Search · suggestions (design): products, scoped searches and brands while typing. */
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const search = useCatalogSearch(query);
  const recents = useRecentSearches();
  const typing = query.trim().length >= 2;

  const submit = (q = query) => {
    const text = q.trim();
    if (text.length < 2) return;
    recents.add(text);
    router.push({ pathname: '/deals/results', params: { q: text } });
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
      <View style={styles.bar}>
        <SearchField
          placeholder="Search paddles, shoes, brands"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => submit()}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          style={{ flex: 1 }}
        />
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <Text variant="body">Cancel</Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {typing ? <Suggestions query={query.trim()} search={search} onSearch={submit} /> : <Idle onSearch={submit} />}
      </ScrollView>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="caption" weight="700" tone="secondary" style={styles.label}>
      {children.toUpperCase()}
    </Text>
  );
}

function Suggestions({ query, search, onSearch }: { query: string; search: ReturnType<typeof useCatalogSearch>; onSearch: (q: string) => void }) {
  const { colors } = useTheme();
  const data = search.data;

  if (!data) {
    return (
      <View style={{ padding: 16, gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Skeleton width={44} height={44} round={12} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="70%" height={13} />
              <Skeleton width="45%" height={11} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (data.totalProducts === 0 && data.brands.length === 0 && data.categories.length === 0) {
    return <EmptyState icon="search" title={`No matches for “${query}”`} message="Check the spelling or try a brand or category, like “JOOLA” or “grips”." />;
  }

  return (
    <View style={{ opacity: search.isPlaceholderData ? 0.6 : 1 }}>
      {data.products.length > 0 && (
        <>
          <SectionLabel>Products</SectionLabel>
          {data.products.slice(0, 5).map((p, i, arr) => (
            <ProductRow
              key={p.id}
              title={`${p.brand.name} ${p.name}`}
              meta={[p.category.name, p.msrpCents != null ? `MSRP ${formatPrice(p.msrpCents)}` : null].filter(Boolean).join(' · ')}
              image={productImage(p)}
              onPress={() => openProduct(p.slug)}
              last={i === arr.length - 1}
            />
          ))}
        </>
      )}

      <SectionLabel>Searches</SectionLabel>
      <SearchRow query={query} onPress={() => onSearch(query)} />
      {data.categories.slice(0, 3).map((c) => (
        <SearchRow key={c.slug} query={query} scope={`in ${c.name}`} onPress={() => openCategory(c.slug)} />
      ))}

      {data.brands.length > 0 && (
        <>
          <SectionLabel>Brands</SectionLabel>
          {data.brands.slice(0, 3).map((b, i, arr) => (
            <BrandRow key={b.slug} name={b.name} trailing="Brand" onPress={() => openBrand(b.slug)} last={i === arr.length - 1} />
          ))}
        </>
      )}
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginTop: 4 }} />
    </View>
  );
}

function SearchRow({ query, scope, onPress }: { query: string; scope?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={scope ? `${query} ${scope}` : `Search for ${query}`}
      onPress={onPress}
      style={({ pressed }) => [styles.searchRow, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
      <Icon name="search" size={15} color={colors.textSecondary} />
      <Text variant="body" weight="700" style={{ flex: 1 }} numberOfLines={1}>
        {query}
      </Text>
      {scope ? (
        <Text variant="footnote" tone="secondary">
          {scope}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Idle({ onSearch }: { onSearch: (q: string) => void }) {
  const { colors } = useTheme();
  const recents = useRecentSearches();
  const categories = useCategories();

  return (
    <View style={{ gap: 8 }}>
      {recents.items.length > 0 && (
        <>
          <View style={[styles.labelRow]}>
            <SectionLabel>Recent</SectionLabel>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={recents.clear}>
              <Text variant="footnote" weight="600" tone="secondary">
                Clear
              </Text>
            </Pressable>
          </View>
          {recents.items.map((q) => (
            <Pressable
              key={q}
              accessibilityRole="button"
              onPress={() => onSearch(q)}
              style={({ pressed }) => [styles.searchRow, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
              <Icon name="clock" size={15} color={colors.textSecondary} />
              <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                {q}
              </Text>
            </Pressable>
          ))}
        </>
      )}

      <SectionLabel>Categories</SectionLabel>
      <View style={styles.chips}>
        {(categories.data ?? []).map((c) => (
          <Chip key={c.slug} label={c.name} outlined onPress={() => openCategory(c.slug)} />
        ))}
        <Chip label="All brands" outlined onPress={() => router.push({ pathname: '/deals/browse', params: { tab: 'brands' } })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  label: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6, letterSpacing: 0.6 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingRight: 16 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 44 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
});
