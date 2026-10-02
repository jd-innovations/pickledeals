import { LISTING_CONDITIONS } from '@pickledeals/shared';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import {
  ConditionBadge,
  DealCard,
  DealQualityMeter,
  ListingCard,
  MessageBubble,
  OfferCard,
  PriceBlock,
  PromoCodeRow,
  RetailerRow,
  SellerIdentity,
  SystemMessage,
  UsedVsNew,
} from '@/commerce';
import { sampleDeals, sampleListings, sampleOffers } from '@/dev/fixtures';
import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { Button, CardSkeleton, Chip, ChipRow, EmptyState, ErrorState, IconButton, SearchField, SegmentedControl, Text } from '@/ui';

function Section({ title, children, inset = true }: { title: string; children: ReactNode; inset?: boolean }) {
  return (
    <View style={{ gap: 12 }}>
      <Text variant="badge" tone="tertiary" style={{ paddingHorizontal: 16 }}>
        {title}
      </Text>
      <View style={{ paddingHorizontal: inset ? 16 : 0, gap: 12 }}>{children}</View>
    </View>
  );
}

/** Dev-only: every reusable component with sample data, to review against the approved design in both themes. */
export default function GalleryScreen() {
  const { colors } = useTheme();
  const requireAuth = useAuth((s) => s.requireAuth);
  const [saved, setSaved] = useState<Record<string, boolean>>({ d1: true });
  const [seg, setSeg] = useState<'a' | 'b'>('a');
  const toggle = (id: string, intent: 'save_deal' | 'save_listing') =>
    requireAuth(intent, () => setSaved((s) => ({ ...s, [id]: !s[id] })));
  const cardW = 173;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 32 }}>
      <Section title="DEAL CARD · GRID (one badge max · Amazon = check price · sponsored is a text line)" inset={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
          {sampleDeals.map((d) => (
            <DealCard key={d.id} deal={d} width={cardW} saved={!!saved[d.id]} onToggleSave={() => toggle(d.id, 'save_deal')} />
          ))}
        </ScrollView>
      </Section>

      <Section title="LISTING CARD" inset={false}>
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16 }}>
          {sampleListings.map((l) => (
            <ListingCard key={l.id} listing={l} width={cardW} saved={!!saved[l.id]} onToggleSave={() => toggle(l.id, 'save_listing')} />
          ))}
        </View>
      </Section>

      <Section title="PRICE BLOCK · DEAL QUALITY">
        <View style={{ padding: 20, borderRadius: 24, backgroundColor: colors.surface, gap: 16 }}>
          <PriceBlock label="BEST NEW PRICE · COURTSIDE" priceCents={18900} referenceCents={27900} retailer="CourtSide" />
          <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.background }}>
            <DealQualityMeter quality="excellent" detail="Typical $219 · 90-day low $159" />
          </View>
          <Button label="Get deal at CourtSide" icon="external" fullWidth />
        </View>
      </Section>

      <Section title="USED VS NEW">
        <View style={{ padding: 16, borderRadius: 20, backgroundColor: colors.surface }}>
          <UsedVsNew askCents={15000} conditionLabel="Excellent" bestNewCents={18900} bestNewRetailer="CourtSide Pro Shop" />
        </View>
      </Section>

      <Section title="RETAILER ROWS · PROMO CODE">
        <View style={{ borderRadius: 16, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          {sampleOffers.map((o, i) => (
            <RetailerRow key={o.retailer} offer={o} last={i === sampleOffers.length - 1} />
          ))}
        </View>
        <PromoCodeRow title="15% off sitewide" detail="JOOLA.com · verified 2h ago · ends Oct 6" code="DINK15" />
      </Section>

      <Section title="CONDITION · SELLER">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LISTING_CONDITIONS.map((c) => (
            <ConditionBadge key={c.value} condition={c.value} />
          ))}
        </View>
        <ConditionBadge condition="excellent" withDescription />
        <SellerIdentity name="Marcus T." areaLabel="Lakewood Ranch, FL" memberSince="2025" soldCount={14} replyTime="~1 hr" />
      </Section>

      <Section title="OFFERS · MESSAGES">
        <MessageBubble text="Hi! Is this still available?" outgoing receipt="Read 6:44 PM" />
        <MessageBubble text="Yes! About 15 sessions on it, edge guard is clean." outgoing={false} />
        <OfferCard offer={{ status: 'pending', kind: 'offer', fromMe: false, amountCents: 12500, compareCents: 15000, message: 'Can pick up Saturday.', expiresLabel: '47h left' }} />
        <View style={{ alignSelf: 'flex-end' }}>
          <OfferCard offer={{ status: 'countered', kind: 'offer', fromMe: true, amountCents: 12500, compareCents: 15000 }} />
        </View>
        <OfferCard offer={{ status: 'accepted', kind: 'counter', fromMe: true, amountCents: 13500, compareCents: 14000 }} />
        <SystemMessage text="Marcus marked this listing Pending" />
      </Section>

      <Section title="CONTROLS">
        <SearchField placeholder="Search paddles, shoes, brands" />
        <SegmentedControl
          options={[
            { value: 'a', label: 'Delivered price' },
            { value: 'b', label: 'Item price' },
          ]}
          value={seg}
          onChange={setSeg}
        />
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <IconButton icon="chevronLeft" label="Back" />
          <IconButton icon="share" label="Share" tone="glass" />
          <IconButton icon="plus" label="New listing" tone="solid" />
        </View>
        <View style={{ gap: 8 }}>
          <Button label="Get deal" icon="external" />
          <Button label="Make offer" variant="secondary" />
          <Button label="Message" variant="outline" />
          <Button label="Sell yours" variant="link" />
        </View>
      </Section>
      <ChipRow>
        <Chip label="Today" selected />
        <Chip label="Brand" count={2} />
        <Chip label="Under $100" outlined />
        <Chip label="Local pickup" />
      </ChipRow>

      <Section title="STATES">
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <CardSkeleton width={cardW} />
          <CardSkeleton width={cardW} />
        </View>
        <EmptyState icon="heart" title="Nothing saved yet" message="Tap the heart on any deal to watch its price." />
        <ErrorState title="Prices didn’t load" message="Showing prices from 2h ago." onRetry={() => {}} />
      </Section>
    </ScrollView>
  );
}
