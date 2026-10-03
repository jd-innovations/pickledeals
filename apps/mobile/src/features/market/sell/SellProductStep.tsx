import { formatPrice, radius } from '@pickledeals/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProductImage } from '@/commerce';
import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { productImage, useCatalogSearch, useCategories, useProduct } from '@/features/catalog/hooks';
import { Button, Chip, Icon, SearchField, Skeleton, Text, TextField } from '@/ui';

import { useSellDraft, type SellDraft } from '../hooks';
import { SellFrame } from './SellFrame';

/** Step 1 — pick the item from the catalog (prefills brand, model, specs, MSRP) or list a custom item (D3). */
export default function SellProductStep() {
  const { colors } = useTheme();
  const { product: prefillSlug } = useLocalSearchParams<{ product?: string }>();
  const { draft, update } = useSellDraft();
  const requireAuth = useAuth((s) => s.requireAuth);
  const [query, setQuery] = useState('');
  const [slug, setSlug] = useState<string | null>(prefillSlug ?? draft.product?.slug ?? null);
  const [custom, setCustom] = useState(!!draft.custom);
  const [customDraft, setCustomDraft] = useState<NonNullable<SellDraft['custom']>>(draft.custom ?? { title: '', brand: '', categorySlug: 'paddles' });
  const search = useCatalogSearch(query, { limit: 6 });
  const picked = useProduct(slug ?? '');
  const categories = useCategories();
  const p = slug ? picked.data : undefined;
  const [variantId, setVariantId] = useState<string | null>(draft.product?.variantId ?? null);

  // "Sell yours" from a product page arrives with ?product=slug (also when this tab is already open).
  const [seenPrefill, setSeenPrefill] = useState(prefillSlug);
  if (prefillSlug && prefillSlug !== seenPrefill) {
    setSeenPrefill(prefillSlug);
    setSlug(prefillSlug);
    setVariantId(null);
    setCustom(false);
  }

  const variants = p?.variants ?? [];
  const variant = variants.length === 1 ? variants[0] : variants.find((v) => v.id === variantId);
  const ready = custom ? customDraft.title.trim().length >= 3 && !!customDraft.categorySlug : !!p && !!variant;

  const next = () =>
    requireAuth('create_listing', () => {
      if (custom) {
        update({ product: null, custom: { ...customDraft, title: customDraft.title.trim(), brand: customDraft.brand.trim() } });
      } else if (p && variant) {
        update({
          custom: null,
          product: {
            id: p.id,
            slug: p.slug,
            name: p.name,
            brand: p.brand.name,
            categorySlug: p.category.slug,
            variantId: variant.id,
            variantLabel: variants.length > 1 ? variant.label : null,
            msrpCents: variant.msrpCents ?? p.msrpCents,
          },
        });
      }
      router.push('/sell/photos');
    });

  const results = search.data?.products ?? [];

  return (
    <SellFrame step={1} title="What are you selling?" ctaDisabled={!ready} onContinue={next}>
      {custom ? (
        <View style={{ gap: 14 }}>
          <TextField label="What is it?" placeholder="e.g. Vintage wood paddle" value={customDraft.title} onChangeText={(t) => setCustomDraft({ ...customDraft, title: t })} maxLength={80} autoFocus />
          <TextField label="Brand (optional)" placeholder="e.g. HEAD" value={customDraft.brand} onChangeText={(t) => setCustomDraft({ ...customDraft, brand: t })} maxLength={40} />
          <View style={{ gap: 8 }}>
            <Text variant="footnote" weight="600" tone="secondary">
              Category
            </Text>
            <View style={styles.wrap}>
              {(categories.data ?? []).map((c) => (
                <Chip key={c.slug} label={c.name} selected={customDraft.categorySlug === c.slug} onPress={() => setCustomDraft({ ...customDraft, categorySlug: c.slug })} />
              ))}
            </View>
          </View>
          <Text variant="footnote" tone="secondary">
            Custom items go live right away. Our team may link it to the catalog later so it shows up on the product page.
          </Text>
          <Button label="Search the catalog instead" variant="link" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => setCustom(false)} />
        </View>
      ) : (
        <>
          <SearchField placeholder="Search the catalog" value={query} onChangeText={setQuery} autoFocus={!slug} autoCorrect={false} />
          <View accessibilityRole="radiogroup" accessibilityLabel="Catalog matches">
            {(query.trim().length >= 2 ? results : p ? [p] : []).map((r) => {
              const on = r.slug === slug;
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    setSlug(r.slug);
                    setVariantId(null);
                  }}
                  style={[styles.result, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
                  <ProductImage source={productImage(r)} width={52} round={12} padding={4} />
                  <View style={{ flex: 1 }}>
                    <Text variant="subhead" weight="600">
                      {r.brand.name} {r.name}
                    </Text>
                    <Text variant="footnote" tone="secondary" numeric>
                      {r.category.name}
                      {r.msrpCents ? ` · MSRP ${formatPrice(r.msrpCents)}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.radio, on ? { backgroundColor: colors.interactive } : { borderWidth: 1.5, borderColor: colors.border }]}>
                    {on && <Icon name="check" size={14} color={colors.onInteractive} weight="bold" />}
                  </View>
                </Pressable>
              );
            })}
            {query.trim().length >= 2 && search.isFetching && results.length === 0 && <Skeleton height={52} />}
            <Pressable accessibilityRole="button" onPress={() => setCustom(true)} style={styles.result}>
              <View style={[styles.dashed, { borderColor: colors.border }]}>
                <Icon name="plus" size={20} color={colors.textSecondary} />
              </View>
              <Text variant="subhead" weight="600" tone="secondary">
                {query.trim().length >= 2 && results.length === 0 && !search.isFetching ? 'No match — add it as a custom item' : 'Not listed? Add it as a custom item'}
              </Text>
            </Pressable>
          </View>

          {p && variants.length > 1 && (
            <View style={{ gap: 8 }}>
              <Text variant="headline">Which version?</Text>
              <View style={styles.wrap}>
                {variants.map((v) => (
                  <Chip key={v.id} label={v.label} selected={v.id === variant?.id} onPress={() => setVariantId(v.id)} />
                ))}
              </View>
            </View>
          )}

          {p && (
            <View style={{ padding: 14, borderRadius: radius.card + 2, backgroundColor: colors.surface, gap: 8 }}>
              <Text variant="footnote" weight="700">
                Already filled in from the catalog
              </Text>
              <View style={styles.wrap}>
                {[p.brand.name, p.name, p.category.name, variant && variants.length > 1 ? variant.label : null, (variant?.msrpCents ?? p.msrpCents) ? `MSRP ${formatPrice((variant?.msrpCents ?? p.msrpCents)!)}` : null, ...Object.values(p.specs).slice(0, 2)]
                  .filter(Boolean)
                  .map((k) => (
                    <View key={k} style={[styles.known, { backgroundColor: colors.background }]}>
                      <Text variant="caption" weight="600">
                        {k}
                      </Text>
                    </View>
                  ))}
              </View>
            </View>
          )}
        </>
      )}
    </SellFrame>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radio: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dashed: { width: 52, height: 52, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  known: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
});
