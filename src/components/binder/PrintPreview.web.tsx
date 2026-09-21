/**
 * PREVIEW YOUR PRINT: someone's own binder as the sheets they would buy, before they buy them.
 *
 * WHAT IS SHOWN IS PICTURES, NOT A PDF. The sheets are built by the real builder in preview mode
 * (data/placeholderPdf: a watermark tiled across every sheet, art at half the pixels, no
 * instructions file), and then each sheet is drawn to a canvas by pdf.js and shown as an image.
 * An embedded PDF viewer would have been two lines, and every browser's viewer offers Save and
 * Print; a picture of a sheet offers neither. The images also take no pointer events and the
 * context menu is off, so there is no "save image as" on them either.
 *
 * THE HONEST LIMIT. Anything a browser can draw, a determined person can capture. What they
 * would capture here is a watermarked, half-resolution picture of a sheet, which is the point of
 * the two protections above: the preview is for deciding, and it is no use for printing.
 *
 * pdf.js is NOT a dependency of the bundle. It is two static files in public/vendor/pdfjs
 * (3.11.174, Apache-2.0, licence beside them), fetched the first time a preview opens. Nothing
 * for Metro to bundle, nothing in package.json, and nobody who never previews pays for it.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { FillSheetPdf } from '@/data/placeholderPdf';

/** The little of pdf.js this uses. */
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getViewport(o: { scale: number }): { width: number; height: number };
        render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
      }>;
      destroy(): Promise<void>;
    }>;
  };
}

const PDFJS_SRC = '/vendor/pdfjs/pdf.min.js';
const PDFJS_WORKER = '/vendor/pdfjs/pdf.worker.min.js';
/** How wide a sheet is drawn, in pixels. Enough to read a label, far short of print. */
const SHEET_PX = 900;

let pdfJsLoad: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfJsLoad ??= new Promise<PdfJs>((resolve, reject) => {
    const have = (window as unknown as { pdfjsLib?: PdfJs }).pdfjsLib;
    if (have) return resolve(have);
    const el = document.createElement('script');
    el.src = PDFJS_SRC;
    el.async = true;
    el.onload = () => {
      const lib = (window as unknown as { pdfjsLib?: PdfJs }).pdfjsLib;
      if (!lib) return reject(new Error('The preview renderer did not load.'));
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(lib);
    };
    el.onerror = () => reject(new Error('The preview renderer could not be loaded.'));
    document.head.appendChild(el);
  }).catch((e) => {
    pdfJsLoad = null; // a failed load may be retried
    throw e;
  });
  return pdfJsLoad;
}

interface SheetImage {
  key: string;
  section: FillSheetPdf['section'];
  /** 1-based, within its file. */
  n: number;
  url: string;
}

const SECTION_LABEL: Record<FillSheetPdf['section'], string> = {
  placeholders: 'Card placeholders, on plain paper',
  art: 'Art, on matte cardstock',
  instructions: 'Instructions',
};

export function PrintPreview({
  files,
  preparing,
  error,
  footer,
  onClose,
}: {
  /** The preview files from the builder, or null while they are being built. */
  files: FillSheetPdf[] | null;
  /** True while the builder is still working. */
  preparing: boolean;
  /** Why the preview could not be built, if it could not. */
  error: string | null;
  /** What goes under the sheets: the way to buy the real thing. */
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  const [sheets, setSheets] = useState<SheetImage[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    if (!files) return;
    let live = true;
    (async () => {
      setDrawing(true);
      setDrawError(null);
      try {
        const pdfjs = await loadPdfJs();
        for (const file of files) {
          if (file.section === 'instructions') continue;
          // pdf.js takes ownership of the buffer it is given; hand it a copy.
          const doc = await pdfjs.getDocument({ data: file.bytes.slice() }).promise;
          for (let n = 1; n <= doc.numPages && live; n += 1) {
            const page = await doc.getPage(n);
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: SHEET_PX / base.width });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('This browser cannot draw the preview.');
            await page.render({ canvasContext: ctx, viewport }).promise;
            const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
            canvas.width = 0; // let the pixels go; the JPEG is all that is kept
            if (!blob || !live) continue;
            const url = URL.createObjectURL(blob);
            urls.current.push(url);
            setSheets((have) => [...have, { key: `${file.section}-${n}`, section: file.section, n, url }]);
          }
          await doc.destroy();
        }
      } catch (e) {
        if (live) setDrawError((e as Error).message);
      } finally {
        if (live) setDrawing(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [files]);

  // The pictures are blob URLs; give them back when the preview closes.
  useEffect(
    () => () => {
      for (const u of urls.current) URL.revokeObjectURL(u);
      urls.current = [];
    },
    [],
  );

  const problem = error ?? drawError;
  const working = preparing || drawing;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.head}>
            <View style={styles.headText}>
              <ThemedText type="subtitle">Preview your print</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Every sheet exactly as it will be laid out. The watermark and the softer art are only
                on this preview.
              </ThemedText>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" testID="print-preview-close">
              <Text style={styles.done}>Close</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody} testID="print-preview-sheets">
            {sheets.map((s, i) => {
              // A heading where the file changes: placeholders first, then the art.
              const heading = i === 0 || sheets[i - 1].section !== s.section ? SECTION_LABEL[s.section] : null;
              return (
                <View key={s.key} style={styles.sheetWrap}>
                  {heading ? (
                    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                      {heading}
                    </ThemedText>
                  ) : null}
                  <img
                    src={s.url}
                    alt={`${SECTION_LABEL[s.section]}, sheet ${s.n} (watermarked preview)`}
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                    style={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                      borderRadius: 6,
                      boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
                      pointerEvents: 'none',
                      userSelect: 'none',
                    }}
                  />
                </View>
              );
            })}
            {working ? (
              <View style={styles.center}>
                <ActivityIndicator />
                <ThemedText type="small" themeColor="textSecondary">
                  {preparing ? 'Laying out your sheets…' : 'Drawing the next sheet…'}
                </ThemedText>
              </View>
            ) : null}
            {problem ? (
              <ThemedText type="small" style={styles.error}>
                {problem}
              </ThemedText>
            ) : null}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.scrim45, padding: Spacing.three },
  card: { width: '100%', maxWidth: 760, maxHeight: '94%', borderRadius: Radius.lg, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three, padding: Spacing.four, paddingBottom: Spacing.three },
  headText: { flex: 1, gap: 2 },
  done: { color: Palette.accent, fontSize: FontSize.body, fontWeight: Weight.semibold },
  scroll: { flexGrow: 0 },
  scrollBody: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.three },
  sheetWrap: { gap: Spacing.two },
  sectionLabel: { marginTop: Spacing.one },
  center: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  error: { color: Palette.danger },
  footer: { padding: Spacing.four, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline, gap: Spacing.two },
});
