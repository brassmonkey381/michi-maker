/**
 * DISCOVER'S MAKERS (MIC-017 piece 8, owner 2026-11-11): "Top makers" and "Recently active makers",
 * each maker a card with their avatar, name, how many binders and likes, and their three best (or
 * newest) binders; the card opens their profile card. Name search is a small box at the top that
 * opens the people search. Same paging as Discover's binders: a carousel on a wide screen, a list
 * on a phone, Load more under both. Makers come from grouping Discover's own rankings
 * (data/makers), and each card loads its binders' faces only when it is shown.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BinderThumb } from '@/components/binder/BinderThumb';
import { PagedCarousel } from '@/components/PagedCarousel';
import { PeopleSearch } from '@/components/people/PeopleSearch';
import { ProfileAvatarButton } from '@/components/people/ProfileAvatarButton';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { fetchDiscoverRows, hydrateRankedBinders } from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { groupMakers, type Maker } from '@/data/makers';
import { fetchAvatarsByUsername } from '@/data/profileRepo';

const POOL = 300;
const SHOW = 3;

export function MakersFeed({ width, phone }: { width: number; phone: boolean }) {
  const [top, setTop] = useState<Maker[] | null>(null);
  const [recent, setRecent] = useState<Maker[] | null>(null);
  const [avatars, setAvatars] = useState<Map<string, string | null>>(new Map());
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([fetchDiscoverRows('likes', POOL), fetchDiscoverRows('recent', POOL)])
      .then(([liked, newest]) => {
        if (!live) return;
        // One pool from both rankings (a binder in both counts once), so a maker with many pages
        // and few likes is still in it.
        const pool = [...newest, ...liked];
        const t = groupMakers(pool, 'pages');
        const r = groupMakers(pool, 'recent');
        setTop(t);
        setRecent(r);
        return fetchAvatarsByUsername([...t, ...r].map((m) => m.name));
      })
      .then((a) => live && a && setAvatars(a))
      .catch(() => {
        if (live) {
          setTop([]);
          setRecent([]);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <View style={styles.wrap} testID="makers-feed">
      <Pressable onPress={() => setSearchOpen(true)} accessibilityRole="search" style={styles.searchBox} testID="makers-search">
        <Text style={styles.searchText}>Find a maker by name</Text>
      </Pressable>
      <PeopleSearch visible={searchOpen} onClose={() => setSearchOpen(false)} />
      <MakerSection title="Top makers" note="Ranked by the public pages they have made." makers={top} avatars={avatars} width={width} phone={phone} testID="makers-top" />
      <MakerSection title="Recently active makers" note="Who has shared a binder lately." makers={recent} avatars={avatars} width={width} phone={phone} testID="makers-recent" />
    </View>
  );
}

function MakerSection({
  title,
  note,
  makers,
  avatars,
  width,
  phone,
  testID,
}: {
  title: string;
  note: string;
  makers: Maker[] | null;
  avatars: Map<string, string | null>;
  width: number;
  phone: boolean;
  testID: string;
}) {
  // How many makers a carousel page or a phone list shows before "Load more makers".
  // Cards fill the row: as many columns as keep a card at least 320 wide, two rows a page.
  const cols = phone ? 1 : Math.max(2, Math.floor((width + 12) / (320 + 12)));
  const cardW = phone ? width : Math.floor((width - 12 * (cols - 1)) / cols);
  const perPage = phone ? 4 : cols * 2;
  const [count, setCount] = useState(perPage);
  if (makers === null) {
    return (
      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>{title}</ThemedText>
        <ActivityIndicator />
      </View>
    );
  }
  if (!makers.length) return null;
  const list = makers.slice(0, count);
  const more = count < makers.length;
  const card = (m: Maker) => <MakerCard key={m.name} maker={m} avatar={avatars.get(m.name.toLowerCase()) ?? null} width={cardW} />;
  const pages: React.ReactNode[] = [];
  for (let i = 0; i < list.length; i += perPage) pages.push(<View key={i} style={[styles.page, { width }]}>{list.slice(i, i + perPage).map(card)}</View>);
  return (
    <View style={styles.section} testID={testID}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>{note}</ThemedText>
      {phone ? (
        <View style={styles.list}>{list.map(card)}</View>
      ) : (
        <PagedCarousel width={width} pages={pages} prevLabel="Previous makers" nextLabel="More makers" onReachEnd={more ? () => setCount((c) => c + perPage) : undefined} />
      )}
      {more ? (
        <Pressable onPress={() => setCount((c) => c + perPage)} accessibilityRole="button" style={styles.more} testID={`${testID}-more`}>
          <ThemedText type="smallBold">Load more makers</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** One maker: who they are, then their best three binders; the card opens their profile. */
function MakerCard({ maker, avatar, width }: { maker: Maker; avatar: string | null; width: number }) {
  const router = useRouter();
  const [binders, setBinders] = useState<DemoBinder[] | null>(null);
  useEffect(() => {
    let live = true;
    hydrateRankedBinders(maker.rows.slice(0, SHOW))
      .then((b) => live && setBinders(b))
      .catch(() => live && setBinders([]));
    return () => {
      live = false;
    };
  }, [maker]);
  const open = () => router.push(`/u/${maker.name}` as Href);
  const thumbW = Math.floor((width - 2 * Spacing.three - (SHOW - 1) * 8) / SHOW);
  const n = maker.rows.length;
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${maker.name}'s profile`} style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]} testID="maker-card">
      <View style={styles.head}>
        <ProfileAvatarButton username={maker.name} avatarUrl={avatar} size={36} onPress={open} />
        <View style={styles.headText}>
          <Text style={styles.name} numberOfLines={1}>@{maker.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>{`${n} binder${n === 1 ? '' : 's'} · ${maker.pages} page${maker.pages === 1 ? '' : 's'}`}</Text>
        </View>
      </View>
      <View style={styles.thumbs}>
        {binders === null ? (
          <ActivityIndicator />
        ) : (
          binders.map((b) => <BinderThumb key={b.id} binder={b} width={thumbW} onPress={() => router.push(`/binder/${b.id}` as Href)} />)
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.four },
  searchBox: { alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: Spacing.three, justifyContent: 'center', borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairline, backgroundColor: Palette.panel },
  searchText: { color: Palette.muted, fontSize: FontSize.sm },
  section: { gap: Spacing.two },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
  note: { marginTop: -Spacing.one },
  list: { gap: Spacing.three },
  page: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { padding: Spacing.three, gap: Spacing.two, borderRadius: Radius.panel, borderWidth: 1, borderColor: Palette.hairline, backgroundColor: Palette.panel },
  pressed: { opacity: 0.85 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headText: { flex: 1, minWidth: 0 },
  name: { fontSize: FontSize.md, fontWeight: Weight.bold, color: Palette.ink },
  meta: { fontSize: FontSize.sm, color: Palette.muted },
  thumbs: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', minHeight: 60 },
  more: { alignSelf: 'center', minHeight: 40, paddingHorizontal: Spacing.four, justifyContent: 'center', borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairline },
});
