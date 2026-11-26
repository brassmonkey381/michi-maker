/**
 * /lab/search : the owner's search lab (MIC-080). Admins only; everyone else gets the not-found
 * page and nothing is fetched.
 *
 * Type a query and every lane of Discover's search runs on its own, side by side (stacked on a
 * phone): its time, its count, its error, and per result the binder, the numbers the RPC returns
 * and why it matched. The merged list is built by data/discoverMerge, the same functions Discover
 * uses, so it is Discover's order. Below, a saved list of test queries with Run all, good / bad
 * marks per result and an export. Marks and the list stay on this device. READ ONLY: no writes
 * and no analytics events.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Fold, LabButton, LabGate, LabInput, Line, Mono, Panel, labStyles } from '@/components/lab/LabUi';
import { Breakpoints, FontSize, Palette, Spacing } from '@/constants/theme';
import {
  DEFAULT_TEST_QUERIES,
  exportVerdicts,
  fmtMs,
  normaliseQueries,
  parseVerdicts,
  setVerdict,
  verdictOf,
  type Verdict,
  type Verdicts,
} from '@/data/searchLab';
import { runLabSearch, type LabLane, type LabRow, type LabSearch } from '@/data/searchLabRepo';
import { readLab, writeLab } from '@/lib/labStorage';

const SHOW = 25;

export default function SearchLabScreen() {
  return <LabGate title="Search lab">{() => <SearchLab />}</LabGate>;
}

function SearchLab() {
  const { width } = useWindowDimensions();
  const wide = width >= Breakpoints.rail;
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabSearch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);

  // Verdicts and the saved list, from this device.
  const [verdicts, setVerdicts] = useState<Verdicts>({});
  const [queries, setQueries] = useState<string[]>([...DEFAULT_TEST_QUERIES]);
  useEffect(() => {
    let live = true;
    void Promise.all([readLab('verdicts'), readLab('queries')]).then(([v, qs]) => {
      if (!live) return;
      setVerdicts(parseVerdicts(v));
      if (qs) {
        try {
          const list = normaliseQueries(JSON.parse(qs) as unknown[]);
          if (list.length) setQueries(list);
        } catch {
          /* keep the defaults */
        }
      }
    });
    return () => {
      live = false;
    };
  }, []);
  const mark = (query: string, id: string, v: Verdict) => {
    setVerdicts((cur) => {
      const next = setVerdict(cur, query, id, verdictOf(cur, query, id) === v ? null : v);
      void writeLab('verdicts', JSON.stringify(next));
      return next;
    });
  };
  const saveQueries = (list: string[]) => {
    const clean = normaliseQueries(list);
    setQueries(clean);
    void writeLab('queries', JSON.stringify(clean));
  };

  const run = async () => {
    const text = q.trim();
    if (!text) return;
    const id = ++req.current;
    setBusy(true);
    setError(null);
    try {
      const r = await runLabSearch(text);
      if (id === req.current) setResult(r);
    } catch (e) {
      if (id === req.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === req.current) setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <Line tone="muted">Every lane of Discover's search, run separately. The merged list uses Discover's own merge.</Line>
      <View style={labStyles.row}>
        <View style={[labStyles.grow, styles.queryBox]}>
          <LabInput value={q} onChangeText={setQ} onSubmitEditing={run} placeholder="A query, as typed on Discover" returnKeyType="search" testID="lab-query" />
        </View>
        <LabButton label="Run" tone="primary" onPress={run} busy={busy} disabled={!q.trim()} testID="lab-run" />
      </View>
      {error ? <Line tone="danger">{error}</Line> : null}
      {result ? <Results r={result} wide={wide} verdicts={verdicts} onMark={mark} /> : null}

      <RunAll queries={queries} onSave={saveQueries} verdicts={verdicts} onMark={mark} />
    </View>
  );
}

function Results({ r, wide, verdicts, onMark }: { r: LabSearch; wide: boolean; verdicts: Verdicts; onMark: (q: string, id: string, v: Verdict) => void }) {
  const p = r.parsed;
  return (
    <View style={styles.page}>
      <Panel title={`"${r.query}" in ${fmtMs(r.totalMs)}`} sub="How the query parses">
        <Mono>{`words: ${JSON.stringify(p.words)}  fields: ${JSON.stringify(p.fields)}  compares: ${JSON.stringify(p.comparisons)}`}</Mono>
        <Mono>{`price: ${p.minPrice ?? '-'}..${p.maxPrice ?? '-'}  sort: ${p.sort} ${p.sortDir}  colour word: ${r.colourWord ? `${r.colourWord.family}${r.colourWord.onlyColour ? ' (alone)' : ''}` : 'none'}`}</Mono>
      </Panel>
      <Panel title={`Merged, as Discover shows it (${r.merged.length})`} sub="Ranked rows first (card lanes and colour pages), then title lane binders no ranked row named." testID="lab-merged">
        <RowList rows={r.merged} query={r.query} verdicts={verdicts} onMark={onMark} showFrom />
      </Panel>
      <View style={[styles.lanes, wide && styles.lanesWide]}>
        {r.lanes.map((lane) => (
          <LaneCard key={lane.run.key} lane={lane} wide={wide} />
        ))}
      </View>
    </View>
  );
}

function LaneCard({ lane, wide }: { lane: LabLane; wide: boolean }) {
  const { run } = lane;
  const sub = run.skipped
    ? run.skipped
    : `${fmtMs(run.ms)}  ·  ${run.value === null ? 'null (no answer)' : `${lane.rows.length} binders`}`;
  return (
    <View style={[styles.lane, wide && styles.laneWide]} testID={`lab-lane-${run.key}`}>
      <Panel title={run.label} sub={sub}>
        {run.error ? <Mono tone="danger">{`error: ${run.error}`}</Mono> : null}
        {run.note ? <Mono tone="muted">{run.note}</Mono> : null}
        {!run.skipped ? <RowList rows={lane.rows} /> : null}
      </Panel>
    </View>
  );
}

function RowList({
  rows,
  query,
  verdicts,
  onMark,
  showFrom,
  limit = SHOW,
}: {
  rows: (LabRow & { from?: string })[];
  query?: string;
  verdicts?: Verdicts;
  onMark?: (q: string, id: string, v: Verdict) => void;
  showFrom?: boolean;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <Line tone="muted">No results.</Line>;
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <View style={styles.rows}>
      {shown.map((r) => (
        <ResultRow key={`${r.binder_id}-${r.rank}`} r={r} query={query} verdict={query && verdicts ? verdictOf(verdicts, query, r.binder_id) : null} onMark={onMark} showFrom={showFrom} />
      ))}
      {rows.length > limit ? <LabButton label={all ? 'Show fewer' : `Show all ${rows.length}`} onPress={() => setAll((a) => !a)} /> : null}
    </View>
  );
}

function ResultRow({
  r,
  query,
  verdict,
  onMark,
  showFrom,
}: {
  r: LabRow & { from?: string };
  query?: string;
  verdict: Verdict | null;
  onMark?: (q: string, id: string, v: Verdict) => void;
  showFrom?: boolean;
}) {
  const nums = [
    r.author ? `@${r.author}` : null,
    r.likes != null ? `${r.likes} likes` : null,
    r.pages != null ? `${r.pages} pages` : null,
    r.score != null ? `score ${Number(r.score).toFixed(3)}` : null,
    r.hits != null ? `hits ${r.hits}` : null,
    showFrom && r.from ? `from ${r.from}` : null,
  ].filter(Boolean);
  return (
    <View style={styles.result}>
      <Line bold>{`${r.rank}. ${r.title ?? r.binder_id}`}</Line>
      <Mono tone="muted">{`${nums.join('  ·  ')}  ·  ${r.binder_id}`}</Mono>
      {r.why.map((w) => (
        <Mono key={w}>{w}</Mono>
      ))}
      {query && onMark ? (
        <View style={labStyles.row}>
          <LabButton label={verdict === 'good' ? 'Good (marked)' : 'Good'} tone={verdict === 'good' ? 'good' : 'plain'} onPress={() => onMark(query, r.binder_id, 'good')} />
          <LabButton label={verdict === 'bad' ? 'Bad (marked)' : 'Bad'} tone={verdict === 'bad' ? 'bad' : 'plain'} onPress={() => onMark(query, r.binder_id, 'bad')} />
        </View>
      ) : null}
    </View>
  );
}

function RunAll({
  queries,
  onSave,
  verdicts,
  onMark,
}: {
  queries: string[];
  onSave: (list: string[]) => void;
  verdicts: Verdicts;
  onMark: (q: string, id: string, v: Verdict) => void;
}) {
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [runs, setRuns] = useState<{ query: string; result: LabSearch | null; error: string | null }[]>([]);
  const [exported, setExported] = useState<string | null>(null);
  const stop = useRef(false);

  const runAll = async () => {
    setBusy(true);
    stop.current = false;
    setRuns([]);
    for (let i = 0; i < queries.length && !stop.current; i += 1) {
      const query = queries[i];
      setProgress(`${i + 1} of ${queries.length}: ${query}`);
      try {
        const result = await runLabSearch(query, { explain: false });
        setRuns((cur) => [...cur, { query, result, error: null }]);
      } catch (e) {
        setRuns((cur) => [...cur, { query, result: null, error: e instanceof Error ? e.message : String(e) }]);
      }
    }
    setProgress('');
    setBusy(false);
  };

  return (
    <Panel title="Test queries" sub="Saved on this device. Run all shows each query's top 10 merged results; mark each one good or bad." testID="lab-runall">
      <View style={styles.chips}>
        {queries.map((query) => (
          <View key={query} style={styles.chip}>
            <Text style={styles.chipText}>{query}</Text>
            <LabButton label="Remove" a11yLabel={`Remove ${query}`} onPress={() => onSave(queries.filter((x) => x !== query))} />
          </View>
        ))}
      </View>
      <View style={labStyles.row}>
        <View style={[labStyles.grow, styles.queryBox]}>
          <LabInput
            value={adding}
            onChangeText={setAdding}
            placeholder="Add a test query"
            onSubmitEditing={() => {
              onSave([...queries, adding]);
              setAdding('');
            }}
          />
        </View>
        <LabButton
          label="Add"
          disabled={!adding.trim()}
          onPress={() => {
            onSave([...queries, adding]);
            setAdding('');
          }}
        />
        <LabButton label="Reset list" onPress={() => onSave([...DEFAULT_TEST_QUERIES])} />
      </View>
      <View style={labStyles.row}>
        <LabButton label="Run all" tone="primary" busy={busy} onPress={runAll} testID="lab-runall-go" />
        {busy ? <LabButton label="Stop" onPress={() => (stop.current = true)} /> : null}
        <LabButton label={exported === null ? 'Export verdicts' : 'Hide export'} onPress={() => setExported((cur) => (cur === null ? exportVerdicts(verdicts) : null))} />
      </View>
      {progress ? <Line tone="muted">{`Running ${progress}`}</Line> : null}
      {exported !== null ? <LabInput multiline value={exported} editable={false} selectTextOnFocus testID="lab-export" /> : null}
      {runs.map(({ query, result, error }) => (
        <View key={query} style={styles.runBlock}>
          <Line bold>{`"${query}"${result ? `  ·  ${result.merged.length} merged  ·  ${fmtMs(result.totalMs)}` : ''}`}</Line>
          {error ? <Mono tone="danger">{error}</Mono> : null}
          {result
            ? result.lanes
                .filter((l) => l.run.error)
                .map((l) => <Mono key={l.run.key} tone="danger">{`${l.run.label}: ${l.run.error}`}</Mono>)
            : null}
          {result ? <RowList rows={result.merged.slice(0, 10)} query={query} verdicts={verdicts} onMark={onMark} showFrom limit={10} /> : null}
          {result ? (
            <Fold title="lane counts">
              {() => (
                <View>
                  {result.lanes.map((l) => (
                    <Mono key={l.run.key}>{`${l.run.label}: ${l.run.skipped ? 'skipped' : `${l.rows.length} in ${fmtMs(l.run.ms)}`}`}</Mono>
                  ))}
                </View>
              )}
            </Fold>
          ) : null}
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  page: { gap: Spacing.three, paddingBottom: Spacing.five },
  queryBox: { minWidth: 200 },
  lanes: { gap: Spacing.three },
  lanesWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  lane: { width: '100%' },
  laneWide: { width: undefined, flexGrow: 1, flexBasis: 320, maxWidth: '100%' },
  rows: { gap: Spacing.three },
  result: { gap: Spacing.one, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline, paddingTop: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 999,
    paddingLeft: Spacing.three,
  },
  chipText: { fontSize: FontSize.body, color: Palette.ink },
  runBlock: { gap: Spacing.two, borderTopWidth: 1, borderTopColor: Palette.hairlineStrong, paddingTop: Spacing.three },
});
