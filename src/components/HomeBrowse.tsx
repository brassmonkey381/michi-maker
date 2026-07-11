/**
 * A collapsible "Browse all cards" section for the home screen. Collapsed by default so the
 * home page never pays the ~25 MB catalog load or renders any card images on first paint —
 * `useCatalog(open)` only forces the load once the section is expanded. Mounts the shared
 * `CardBrowse` (series → set → card, search, facets) in a fixed-height panel so its inner
 * FlatList gets a bounded, scrollable viewport inside the home ScrollView.
 *
 * On home there's no pocket to place into, so instead of a functionless "Place in pocket" the
 * card tap offers **Add to a binder…** — a chooser that drops the card into an existing binder's
 * first free pocket (or a brand-new binder).
 */
import { type CardAction, type CardActionsFactory } from 'tcgscan-browse';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AddToBinderSheet } from '@/components/binder/AddToBinderSheet';
import { CardBrowse } from '@/components/binder/CardBrowse';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useBinders } from '@/store/binders';

export function HomeBrowse({
  onOpenBinder,
  open: openProp,
  onOpenChange,
}: {
  onOpenBinder?: (id: string) => void;
  /** Controlled expansion — pass with `onOpenChange` so a sibling (the recent feed) can
   *  open this browser to show Find-similar / View-set results. Uncontrolled if omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => (onOpenChange ?? setOpenState)(next);
  // Only subscribes-and-loads the catalog when expanded; collapsed is a no-op for page load.
  const { catalog, error, status, progress } = useCatalog(open);
  const { height } = useWindowDimensions();
  const panelHeight = Math.max(460, Math.round(height * 0.7));

  const store = useBinders();
  const [addCardId, setAddCardId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const toastId = useRef(0);

  const showAdded = (binderId: string, title: string) => {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message: `Added to ${title}`,
      ...(onOpenBinder ? { actionLabel: 'Open', onAction: () => onOpenBinder(binderId) } : {}),
    });
  };

  // Tap a card → offer "Add to a binder…" first, then the browser's own Find similar / View set.
  const cardActions: CardActionsFactory = (_card, builtins) => {
    const add: CardAction = {
      key: 'add',
      kind: 'primary',
      label: 'Add to a binder…',
      onPress: (c) => setAddCardId(c.id),
    };
    return [add, builtins.findSimilar, builtins.viewSet].filter(Boolean) as CardAction[];
  };

  const addToExisting = (binderId: string) => {
    if (!addCardId) return;
    const title = store.getBinder(binderId)?.title ?? 'binder';
    store.addCardToBinder(binderId, addCardId);
    setAddCardId(null);
    showAdded(binderId, title);
  };
  const addToNew = () => {
    if (!addCardId) return;
    const binder = store.createBinderWithCard(addCardId);
    setAddCardId(null);
    showAdded(binder.id, binder.title);
  };

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.header}>
        <ThemedText type="smallBold" style={styles.title}>
          Browse all cards
        </ThemedText>
        <ThemedText type="smallBold" style={styles.chevron}>
          {open ? '▾' : '▸'}
        </ThemedText>
      </Pressable>

      {open ? (
        <View style={[styles.panel, { height: panelHeight }]}>
          {catalog ? (
            <CardBrowse catalog={catalog} cardActions={cardActions} />
          ) : (
            <View style={styles.center}>
              {error ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Card catalog is unavailable right now.
                </ThemedText>
              ) : (
                <>
                  <ActivityIndicator />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.loadingText}>
                    {status === 'parsing'
                      ? `Preparing cards… ${Math.round(progress * 100)}%`
                      : 'Loading cards…'}
                  </ThemedText>
                </>
              )}
            </View>
          )}
        </View>
      ) : null}

      {addCardId ? (
        <AddToBinderSheet
          binders={store.userBinders}
          onPick={addToExisting}
          onNew={addToNew}
          onClose={() => setAddCardId(null)}
        />
      ) : null}
      <Toast spec={toast} onDismiss={() => setToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.five },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  title: { textTransform: 'uppercase', letterSpacing: 0.5 },
  chevron: { color: Palette.muted, fontSize: FontSize.md },
  panel: {
    marginTop: Spacing.two,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: Spacing.two },
});
