/**
 * Money, grouped, in `/studio`: the same five groups the morning digest prints (analytics-studio
 * scripts/digest.mjs, "Money grouped by state"), read live instead of once a day.
 *
 * In trial, Paying, One-off sales, Granted, Lapsed. One line per person. The rules mirror the
 * digest so the two never disagree:
 *   - a Stripe row and a free-days trial row for the same person are ONE "In trial" line (the
 *     webhook writes both for one checkout);
 *   - a Stripe/Apple row whose term is shorter than its cadence is a trial, not a sale;
 *   - a row whose term has ended is Lapsed, and a short one that ended was a trial nobody paid for;
 *   - a cancelled row keeps its real end date, which is when access stops.
 * Test and admin accounts are excluded server-side.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { fetchMoneyLedger, type LedgerRow, type StudioApp } from '@/data/studioOps';

const DAY_MS = 86_400_000;
const PAYMENT_SOURCES = new Set(['stripe', 'apple', 'google']);
/** Shorter than this and a term is a trial, not a paid period. */
const PERIOD_FLOOR_DAYS: Record<string, number> = { year: 300, month: 20 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Kind = 'trialing' | 'paid' | 'oneoff' | 'comped' | 'lapsed';

function kindOf(r: LedgerRow): Kind {
  if (!PAYMENT_SOURCES.has(r.source ?? '')) return 'comped';
  if (r.product.startsWith('pdf_binder:')) return 'oneoff';
  if (r.expiresAt && Date.parse(r.expiresAt) < Date.now()) return 'lapsed';
  if (!r.expiresAt) return 'paid';
  const floor = PERIOD_FLOOR_DAYS[r.interval ?? ''];
  if (!floor) return 'paid';
  const days = (Date.parse(r.expiresAt) - Date.parse(r.grantedAt)) / DAY_MS;
  return days < floor ? 'trialing' : 'paid';
}

function shortDate(iso: string | null): string {
  if (!iso) return 'no end';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear() === new Date().getFullYear() ? '' : `, ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${y}`;
}

function money(minor: number | null, currency: string | null): string | null {
  if (minor == null) return null;
  const amt = (minor / 100).toFixed(2);
  return (currency ?? 'usd').toLowerCase() === 'usd' ? `$${amt}` : `${amt} ${(currency ?? '').toUpperCase()}`;
}

function perLabel(interval: string | null): string {
  return interval === 'year' ? '/yr' : interval === 'month' ? '/mo' : '';
}

function thenPrice(r: LedgerRow): string {
  const m = money(r.unitAmountMinor, r.currency);
  const per = r.interval === 'year' ? 'per year' : r.interval === 'month' ? 'per month' : null;
  if (m && per) return `${m} ${per}`;
  if (m) return m;
  return per ? `the list price ${per}` : 'the list price';
}

function tierName(product: string): string {
  if (product.startsWith('pdf_binder:')) return 'PDF binder';
  if (product.endsWith('_vip')) return 'VIP';
  if (product.endsWith('_pro')) return 'PRO';
  return product;
}

function who(r: LedgerRow): string {
  return r.username ? `@${r.username}` : r.userId.slice(0, 8);
}

interface Line {
  key: string;
  who: string;
  what: string;
  warn: boolean;
  sort: number;
}

type Groups = Record<'trial' | 'paying' | 'oneoff' | 'granted' | 'lapsed', Line[]>;
const TITLES: Record<keyof Groups, string> = {
  trial: 'In trial',
  paying: 'Paying',
  oneoff: 'One-off sales',
  granted: 'Granted',
  lapsed: 'Lapsed',
};

function group(rows: LedgerRow[]): { groups: Groups; mrrMinor: number; oneOffMinor: number; everTrialed: number } {
  const g: Groups = { trial: [], paying: [], oneoff: [], granted: [], lapsed: [] };
  const ents = rows.filter((r) => r.kind === 'entitlement');
  const trials = rows.filter((r) => r.kind === 'free_trial');
  const stripeTrial = new Map(ents.filter((r) => kindOf(r) === 'trialing').map((r) => [r.userId, r]));
  let mrrMinor = 0;
  let oneOffMinor = 0;

  // Live free trials, merged with their Stripe twin when there is one.
  for (const t of trials) {
    if (!t.expiresAt || Date.parse(t.expiresAt) < Date.now()) continue;
    const daysLeft = Math.max(0, Math.ceil((Date.parse(t.expiresAt) - Date.now()) / DAY_MS));
    const left = daysLeft === 0 ? 'ends today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
    const s = stripeTrial.get(t.userId);
    const sort = Date.parse(t.expiresAt);
    if (!s) {
      g.trial.push({ key: `t:${t.userId}`, who: who(t), what: `${left} · no card on file`, warn: daysLeft <= 1, sort });
      continue;
    }
    stripeTrial.delete(t.userId);
    g.trial.push(
      s.cancelledAt
        ? { key: `t:${t.userId}`, who: who(t), what: `${left} · cancelled ${shortDate(s.cancelledAt)}, no charge coming`, warn: false, sort }
        : { key: `t:${t.userId}`, who: who(t), what: `${left} · charges ${thenPrice(s)} on ${shortDate(s.expiresAt)}`, warn: daysLeft <= 1, sort },
    );
  }
  for (const s of stripeTrial.values()) {
    const sort = s.expiresAt ? Date.parse(s.expiresAt) : Infinity;
    g.trial.push(
      s.cancelledAt
        ? { key: `s:${s.userId}:${s.product}`, who: who(s), what: `cancelled ${shortDate(s.cancelledAt)} · ends ${shortDate(s.expiresAt)}, no charge coming`, warn: false, sort }
        : { key: `s:${s.userId}:${s.product}`, who: who(s), what: `charges ${thenPrice(s)} on ${shortDate(s.expiresAt)}`, warn: false, sort },
    );
  }

  for (const r of ents) {
    const k = kindOf(r);
    const price = money(r.unitAmountMinor, r.currency);
    const key = `e:${r.userId}:${r.product}:${r.grantedAt}`;
    if (k === 'paid') {
      if (r.unitAmountMinor != null) mrrMinor += r.interval === 'year' ? r.unitAmountMinor / 12 : r.unitAmountMinor;
      g.paying.push({
        key,
        who: who(r),
        what: `${tierName(r.product)} ${price ? `${price}${perLabel(r.interval)}` : '(price not recorded)'} via ${r.source}${
          r.cancelledAt ? ` · cancelled ${shortDate(r.cancelledAt)}, ends ${shortDate(r.expiresAt)}` : r.expiresAt ? ` · renews ${shortDate(r.expiresAt)}` : ' · no end'
        }`,
        warn: !!r.cancelledAt,
        sort: r.expiresAt ? Date.parse(r.expiresAt) : Infinity,
      });
    } else if (k === 'oneoff') {
      if (r.unitAmountMinor != null) oneOffMinor += r.unitAmountMinor;
      g.oneoff.push({ key, who: who(r), what: `PDF binder ${price ?? '(price not recorded)'} · ${shortDate(r.grantedAt)}`, warn: false, sort: -Date.parse(r.grantedAt) });
    } else if (k === 'comped') {
      g.granted.push({ key, who: who(r), what: `${tierName(r.product)} · ${r.source ?? 'manual'} · ${r.expiresAt ? `until ${shortDate(r.expiresAt)}` : 'no end'}`, warn: false, sort: r.expiresAt ? Date.parse(r.expiresAt) : Infinity });
    } else if (k === 'lapsed') {
      const days = (Date.parse(r.expiresAt!) - Date.parse(r.grantedAt)) / DAY_MS;
      const floor = PERIOD_FLOOR_DAYS[r.interval ?? ''] ?? 0;
      const how = floor && days < floor ? 'trial ended, never charged' : 'ended';
      g.lapsed.push({ key, who: who(r), what: `${tierName(r.product)}${r.interval ? ` ${r.interval}ly` : ''} · ${how} ${shortDate(r.expiresAt)}`, warn: false, sort: -Date.parse(r.expiresAt!) });
    }
  }
  for (const k of Object.keys(g) as (keyof Groups)[]) g[k].sort((a, b) => a.sort - b.sort);
  return { groups: g, mrrMinor, oneOffMinor, everTrialed: new Set(trials.map((t) => t.userId)).size };
}

export function MoneyPanel({ app }: { app: StudioApp }) {
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchMoneyLedger()
      .then((r) => active && setRows(r))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.panel}>
        <ThemedText type="small" themeColor="textSecondary">
          Money unavailable: {error}
        </ThemedText>
      </View>
    );
  }
  if (!rows) {
    return (
      <View style={[styles.panel, styles.loading]}>
        <ActivityIndicator color={Palette.accent} />
      </View>
    );
  }

  const mine = rows.filter((r) => r.app === app);
  const { groups, mrrMinor, oneOffMinor, everTrialed } = group(mine);
  const total = Object.values(groups).reduce((n, xs) => n + xs.length, 0);
  const head = [
    `${groups.paying.length} paying${mrrMinor ? ` (${money(Math.round(mrrMinor), 'usd')}/mo)` : ''}`,
    groups.trial.length ? `${groups.trial.length} in trial` : null,
    groups.oneoff.length ? `${groups.oneoff.length} PDF${groups.oneoff.length === 1 ? '' : 's'} sold` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const label = (key: keyof Groups, lines: Line[]): string => {
    if (key === 'paying' && mrrMinor) return `${lines.length} · ${money(Math.round(mrrMinor), 'usd')}/mo run-rate`;
    if (key === 'oneoff' && oneOffMinor) return `${lines.length} · ${money(oneOffMinor, 'usd')} all-time`;
    return String(lines.length);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Money</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {head}
        </ThemedText>
      </View>
      {total === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Nothing on the ledger yet.
        </ThemedText>
      ) : (
        (Object.keys(groups) as (keyof Groups)[])
          .filter((k) => groups[k].length)
          .map((k) => (
            <View key={k} style={styles.group}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.groupTitle}>
                {TITLES[k].toUpperCase()} · {label(k, groups[k])}
              </ThemedText>
              {groups[k].map((l) => (
                <View key={l.key} style={styles.line}>
                  <ThemedText type="small" style={styles.who}>
                    {l.who}
                  </ThemedText>
                  <ThemedText type="small" style={[styles.what, l.warn && styles.warn]}>
                    {l.what}
                  </ThemedText>
                </View>
              ))}
            </View>
          ))
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {everTrialed} ever trialed · test and admin accounts excluded · live, not the morning email
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  loading: { alignItems: 'center', paddingVertical: Spacing.three },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  group: { gap: 2, paddingTop: Spacing.one },
  groupTitle: { letterSpacing: 0.4 },
  line: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  who: { minWidth: 120 },
  what: { flex: 1 },
  warn: { color: Palette.warning },
});
