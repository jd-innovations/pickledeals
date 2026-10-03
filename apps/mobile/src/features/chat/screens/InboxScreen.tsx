import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { useTheme } from '@/design/theme';
import { chooseAction } from '@/lib/dialog';
import { CardSkeleton, Chip, ChipRow, EmptyState, ErrorState, Text } from '@/ui';

import type { Thread } from '../api';
import { ThreadRow } from '../components';
import { useChatMutations, useInbox } from '../hooks';

type Filter = 'all' | 'buying' | 'selling' | 'offers' | 'archived';

/** Messages (design: Inbox; reached from Profile per D5). Swipe a row to mute or archive. */
export default function InboxScreen() {
  const { colors } = useTheme();
  const inbox = useInbox();
  const { setState } = useChatMutations();
  const [filter, setFilter] = useState<Filter>('all');
  const [pulling, setPulling] = useState(false);

  const all = inbox.data ?? [];
  const threads = all.filter((t) =>
    filter === 'archived'
      ? t.archived
      : !t.archived && (filter === 'all' || (filter === 'offers' ? t.offer?.status === 'pending' : filter === 'buying' ? t.role === 'buyer' : t.role === 'seller')),
  );
  const openOffers = all.filter((t) => !t.archived && t.offer?.status === 'pending').length;
  const archivedCount = all.filter((t) => t.archived).length;

  const open = (t: Thread) => router.push({ pathname: '/conversation/[id]', params: { id: t.id } });
  const toggleMute = (t: Thread) => setState.mutate({ id: t.id, muted: !t.muted });
  const toggleArchive = (t: Thread) => setState.mutate({ id: t.id, archived: !t.archived });

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={threads}
      keyExtractor={(t) => t.id}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={async () => {
            setPulling(true);
            await inbox.refetch();
            setPulling(false);
          }}
        />
      }
      contentContainerStyle={{ paddingBottom: 120 }}
      ListHeaderComponent={
        <View style={{ paddingVertical: 8 }}>
          <ChipRow>
            <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label="Buying" selected={filter === 'buying'} onPress={() => setFilter('buying')} />
            <Chip label="Selling" selected={filter === 'selling'} onPress={() => setFilter('selling')} />
            <Chip label="Open offers" count={openOffers} selected={filter === 'offers'} onPress={() => setFilter('offers')} />
            {archivedCount > 0 && <Chip label="Archived" count={archivedCount} selected={filter === 'archived'} onPress={() => setFilter('archived')} />}
          </ChipRow>
        </View>
      }
      ListEmptyComponent={
        inbox.isPending ? (
          <View style={{ padding: 16, gap: 12 }}>
            <CardSkeleton width={358} />
            <CardSkeleton width={358} />
          </View>
        ) : inbox.isError ? (
          <ErrorState title="Couldn’t load your messages" message="Check your connection and try again." onRetry={() => inbox.refetch()} />
        ) : (
          <EmptyState
            icon="message"
            title={filter === 'archived' ? 'Nothing archived' : filter === 'offers' ? 'No open offers' : 'No messages yet'}
            message={filter === 'archived' ? 'Archived conversations come back when there’s a new message.' : 'Message a seller from any listing. Conversations about your listings show up here too.'}
          />
        )
      }
      ItemSeparatorComponent={() => <View style={{ height: 1, marginLeft: 84, backgroundColor: colors.separator }} />}
      renderItem={({ item: t }) => (
        <ReanimatedSwipeable
          friction={1.5}
          rightThreshold={40}
          overshootRight={false}
          renderRightActions={(_p, _t, swipe: SwipeableMethods) => (
            <View style={{ flexDirection: 'row' }}>
              <SwipeAction
                label={t.muted ? 'Unmute' : 'Mute'}
                bg={colors.surfacePressed}
                fg={colors.textPrimary}
                onPress={() => {
                  swipe.close();
                  toggleMute(t);
                }}
              />
              <SwipeAction
                label={t.archived ? 'Unarchive' : 'Archive'}
                bg={colors.interactive}
                fg={colors.onInteractive}
                onPress={() => {
                  swipe.close();
                  toggleArchive(t);
                }}
              />
            </View>
          )}>
          <ThreadRow
            t={t}
            onPress={() => open(t)}
            onLongPress={() =>
              chooseAction(t.otherName, [
                { text: t.muted ? 'Unmute' : 'Mute', onPress: () => toggleMute(t) },
                { text: t.archived ? 'Move to inbox' : 'Archive', onPress: () => toggleArchive(t) },
              ])
            }
          />
        </ReanimatedSwipeable>
      )}
    />
  );
}

function SwipeAction({ label, bg, fg, onPress }: { label: string; bg: string; fg: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ width: 80, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="footnote" weight="700" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}
