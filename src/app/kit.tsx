/**
 * Page-shell and control-kit gallery (dev only) — /kit
 *
 * Every kit control and all three header variants under michi's live skin (components/layout/
 * AppKit), so a slice of the shell can be looked at at 1280 and 390 before it merges. Query
 * params pick the state: ?header=doc|hero|workbench, ?nav=1 for the kit's own rail (the site's rail is already beside it), ?open=sheet|dialog.
 * Lifted from tcgscan-app's /kit with michi's words in it.
 *
 * Production builds redirect home: this is a review surface, not a page.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Chip, ChipRow, Dialog, Footer, Input, Row, RowGroup, Seg, Sheet, Shell, Toast, TypeScale, useKit, type HeaderVariant, type RailGroup } from 'tcgscan-ui';

import { NAV_GROUPS } from '@/components/nav/navItems';

const noop = () => {};

const SORTS = ['Number', 'Rarity', 'Value', 'Artist', 'Name'] as const;

export default function KitGallery() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Gallery />;
}

function Gallery() {
  const params = useLocalSearchParams<{ header?: string; nav?: string; open?: string }>();
  const variant: HeaderVariant = params.header === 'hero' || params.header === 'workbench' ? params.header : 'doc';
  const [header, setHeader] = useState<HeaderVariant>(variant);
  const [sort, setSort] = useState<string>('Number');
  const [finish, setFinish] = useState<'normal' | 'holo' | 'reverse'>('normal');
  const [sheet, setSheet] = useState(params.open === 'sheet');
  const [dialog, setDialog] = useState(params.open === 'dialog');

  // The site's real groups (nav/navItems), lit by the header variant so the rail shows a state.
  const groups: RailGroup[] = NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.map((i) => ({
      key: i.label,
      label: i.label,
      onPress: noop,
      active: (header === 'workbench' && i.label === 'Browse Cards') || (header === 'doc' && i.label === 'How-To') || (header === 'hero' && i.label === 'My Binders'),
    })),
  }));

  return (
    <Shell
      nav={params.nav === '1' ? { brand: <Brand />, groups } : undefined}
      header={{
        variant: header,
        title: header === 'hero' ? 'Build a binder page from three cards' : header === 'workbench' ? 'Browse Cards' : 'Kit gallery',
        lede:
          header === 'hero'
            ? 'Pick three cards you like. The tools fill the page around them by colour, look and theme.'
            : 'Every control on one scale: 36, 44 and 52 tall, rows 48, sheets 56 and 72.',
        primary: header === 'hero' ? { label: 'Start a binder', onPress: noop } : header === 'workbench' ? { label: 'Add to binder', onPress: noop } : undefined,
        secondary: header === 'hero' ? { label: 'Discover binders', onPress: noop } : undefined,
        tools: header === 'workbench' ? <Input shape="search" placeholder="Search cards" /> : undefined,
        filters:
          header === 'workbench' ? (
            <ChipRow>
              {SORTS.map((s) => (
                <Chip key={s} label={s === sort ? `${s} ▲` : s} selected={s === sort} onPress={() => setSort(s)} />
              ))}
            </ChipRow>
          ) : undefined,
      }}
      footer={
        <Footer
          links={[
            { label: 'Plans', onPress: noop },
            { label: 'How-To', onPress: noop },
            { label: 'Terms', onPress: noop },
            { label: 'Privacy', onPress: noop },
          ]}
        />
      }>
      <Section title="Header variant">
        <Seg
          options={[
            { value: 'doc', label: 'Doc' },
            { value: 'hero', label: 'Hero' },
            { value: 'workbench', label: 'Workbench' },
          ]}
          value={header}
          onChange={setHeader}
        />
      </Section>

      <Section title="Three heights">
        <View style={styles.line}>
          <Button look="primary" size="sm" label="Small 36" />
          <Button look="primary" size="md" label="Medium 44" />
          <Button look="primary" size="lg" label="Large 52" />
        </View>
      </Section>

      <Section title="Four looks">
        <View style={styles.line}>
          <Button look="primary" label="Primary" />
          <Button look="secondary" label="Secondary" />
          <Button look="selected" label="Selected" />
          <Button look="quiet" label="Quiet" />
          <Button tone="danger" label="Delete" />
        </View>
      </Section>

      <Section title="Chips, segments, inputs">
        <ChipRow>
          {SORTS.map((s) => (
            <Chip key={s} label={s} selected={s === sort} onPress={() => setSort(s)} />
          ))}
        </ChipRow>
        <View style={styles.line}>
          <Seg
            size="sm"
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'holo', label: 'Holo' },
              { value: 'reverse', label: 'Reverse' },
            ]}
            value={finish}
            onChange={setFinish}
          />
        </View>
        <Input label="Set name or code" placeholder="like 151 or sv3pt5" />
        <View style={styles.line}>
          <Input shape="search" placeholder="Search cards" style={styles.grow} />
          <Button look="primary" label="Search" />
        </View>
      </Section>

      <Section title="Rows">
        <RowGroup>
          <Row label="Theme" value="Neutral" onPress={noop} />
          <Row label="Card language" value="English" onPress={noop} />
          <Row label="Finish" labelColumn>
            <Seg
              size="sm"
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'holo', label: 'Holo' },
              ]}
              value={finish === 'reverse' ? 'normal' : finish}
              onChange={setFinish}
            />
          </Row>
          <Row label="Export" labelColumn>
            <Button size="sm" label="Download PDF" />
          </Row>
        </RowGroup>
      </Section>

      <Section title="Sheets, dialogs, toasts">
        <View style={styles.line}>
          <Button label="Open sheet" onPress={() => setSheet(true)} />
          <Button label="Open dialog" onPress={() => setDialog(true)} />
        </View>
        <Toast message="Pikachu added to page 2" action={{ label: 'Undo', onPress: noop }} />
      </Section>

      <Sheet
        visible={sheet}
        title="Add to binder"
        onClose={() => setSheet(false)}
        actions={[
          { label: 'Cancel', onPress: () => setSheet(false) },
          { label: 'Add 3 cards', look: 'primary', onPress: () => setSheet(false) },
        ]}>
        <Seg
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'holo', label: 'Holo' },
            { value: 'reverse', label: 'Reverse' },
          ]}
          value={finish}
          onChange={setFinish}
        />
        <RowGroup>
          <Row label="Binder" value="Fire types" onPress={noop} />
          <Row label="Page" value="2" onPress={noop} />
        </RowGroup>
      </Sheet>

      <Dialog
        visible={dialog}
        title="Delete this binder?"
        body="Its 4 pages leave your shelf. This cannot be undone."
        onClose={() => setDialog(false)}
        cancel={{ label: 'Keep it', onPress: () => setDialog(false) }}
        confirm={{ label: 'Delete', tone: 'danger', onPress: () => setDialog(false) }}
      />
    </Shell>
  );
}

function Brand() {
  const { colors } = useKit();
  return <Text style={[styles.brand, { color: colors.text }]}>Michi-Maker</Text>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useKit();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingBottom: 8 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  brand: { fontSize: TypeScale.body, fontWeight: '800' },
});
