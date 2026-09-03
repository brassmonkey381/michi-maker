/**
 * Which embedding model answers "find similar" / "✨ Fill page · More like this".
 *
 * TWO AUDIENCES. Everyone sees the VERSION of the model that is answering — similarity results
 * change when the model changes, on a cadence nothing in the app version tracks, and "find similar
 * started returning different cards" previously had no answer anyone could check. Only admins see
 * the PICKER. A surface that has no room for the caption passes `showVersion={false}` and keeps
 * the picker; with the caption off, a non-admin renders nothing at all.
 *
 * WHY THIS IS GATED AND NOT A SETTING. Candidate models are unproven. Two of them return
 * materially different neighbours on ordinary cards (measured against capG-e15: 2 of 5 shared
 * top-5 on a mid-catalog seed) while agreeing almost perfectly on reprint clusters, and no offline
 * bench answers which makes a *better browse neighbour* — that is a human judgement on real seeds.
 * Shipping the choice to everyone would hand the userbase an experiment; keeping it to the admin
 * account makes prod the place we run it.
 *
 * GATED ON `profile.is_admin`, NOT ON AN EMAIL. Same gate `studio.tsx` and `AppRail.web.tsx`
 * already use. An email literal would put the owner's address in every shipped client bundle and
 * would be no harder to bypass — the flag lives server-side, so revoking access is a DB update
 * rather than a release.
 *
 * The gate is a UI convenience, not a security boundary: the *_candidate RPCs are granted to
 * anon/authenticated like every other read, so a determined user could call them directly. That is
 * acceptable — they read nothing private, and they cannot change what anyone else sees. What the
 * gate actually prevents is a normal user stumbling into an experimental model and thinking the
 * app got worse.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  getSimilarityModel,
  listSimilarityModels,
  setSimilarityModel,
  type SimilarityModelInfo,
} from 'tcgscan-browse';

import { useAuth } from '@/store/auth';
import {
  formatPublished,
  getSimilarityModelInfo,
  type SimilarityModel,
} from '@/lib/similarity-model';

/** The live model, as an option. Its absence from listSimilarityModels() is deliberate — live is
 *  `null`, not a row in the candidate table. */
const LIVE = { id: null as string | null, label: 'Live' };

export function SimilarityModelPicker({
  compact = false,
  showVersion = true,
}: {
  compact?: boolean;
  /**
   * Print the "Similarity model X · updated D" caption. Off on /browse (owner call 2026-09-03):
   * a page-wide banner for one feature's model version read as a status line about the whole
   * catalog. On where the model is about to be USED — the fill sheet — which is the moment the
   * question "why did these results change?" actually gets asked.
   */
  showVersion?: boolean;
}) {
  const { profile } = useAuth();
  const isAdmin = !!profile?.is_admin;
  const [models, setModels] = useState<SimilarityModelInfo[]>([]);
  const [active, setActive] = useState<string | null>(getSimilarityModel());
  const [live, setLive] = useState<SimilarityModel | null>(null);

  // Everyone gets the version line; only admins get the chips. Fetched regardless of isAdmin.
  useEffect(() => {
    let alive = true;
    getSimilarityModelInfo().then((m) => alive && setLive(m));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    listSimilarityModels()
      .then((m) => alive && setModels(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const pick = (id: string | null) => {
    setSimilarityModel(id);
    setActive(id);
  };

  // What is ACTUALLY answering: an admin's selected candidate, else the server's live model. The
  // label has to follow the selection, or an admin comparing models would read the live version
  // over candidate results.
  const version = active
    ? `${active} · experimental`
    : live?.publicVersion ?? live?.modelVersion ?? null;
  const updated = active ? null : formatPublished(live?.publishedAt ?? null);
  const versionLine = version && showVersion ? (
    <Text style={styles.caption}>
      Similarity model {version}
      {updated ? ` · updated ${updated}` : ''}
    </Text>
  ) : null;

  // A non-admin, or a server with no candidates pushed, gets the version line and no control —
  // rather than a one-option picker implying a choice exists.
  if (!isAdmin || models.length === 0) {
    return versionLine ? (
      <View style={[styles.row, compact && styles.rowCompact]}>{versionLine}</View>
    ) : null;
  }

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {versionLine}
      <View style={styles.chips}>
        {[LIVE, ...models.map((m) => ({ id: m.modelVersion, label: m.modelVersion }))].map((o) => {
          const on = active === o.id;
          return (
            <Pressable
              key={o.id ?? 'live'}
              onPress={() => pick(o.id)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {active ? (
        <Text style={styles.warn}>
          Experimental model. Results below are not what users see.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  rowCompact: { paddingVertical: 4 },
  caption: { fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(127,127,127,0.45)',
  },
  chipOn: { backgroundColor: 'rgba(127,127,127,0.22)', borderColor: 'rgba(127,127,127,0.9)' },
  chipText: { fontSize: 12, opacity: 0.8 },
  chipTextOn: { fontWeight: '700', opacity: 1 },
  warn: { fontSize: 11, opacity: 0.7, fontStyle: 'italic' },
});
