/**
 * ADMIN-ONLY: which embedding model answers "find similar" / "✨ Fill page · More like this".
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

/** The live model, as an option. Its absence from listSimilarityModels() is deliberate — live is
 *  `null`, not a row in the candidate table. */
const LIVE = { id: null as string | null, label: 'Live' };

export function SimilarityModelPicker({ compact = false }: { compact?: boolean }) {
  const { profile } = useAuth();
  const isAdmin = !!profile?.is_admin;
  const [models, setModels] = useState<SimilarityModelInfo[]>([]);
  const [active, setActive] = useState<string | null>(getSimilarityModel());

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

  // Nothing to choose between: no admin, or a server with no candidates pushed. Render nothing at
  // all rather than a one-option control that implies a choice exists.
  if (!isAdmin || models.length === 0) return null;

  const pick = (id: string | null) => {
    setSimilarityModel(id);
    setActive(id);
  };

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Text style={styles.caption}>Similarity model</Text>
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
          Experimental model — results below are not what users see.
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
