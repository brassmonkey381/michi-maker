/** One figure from a guide's data: a demo clip or still, or a drawn scene by name. */
import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

import {
  CutDiagram,
  EditorMapDiagram,
  FoldDiagram,
  OneOfEachDiagram,
  OperatorsDiagram,
  PaperDiagram,
  QueryAnatomyDiagram,
  SeedDiagram,
  SliceDiagram,
  SwapDiagram,
  TrueSizeDiagram,
  WantListDiagram,
} from '@/components/learn/Diagrams';
import { GuideMedia } from '@/components/learn/GuideMedia';
import { EeveeReplay } from '@/components/michi/EeveeReplay';
import type { DiagramName, GuideFigure as GuideFigureData } from '@/data/guides';

// A card illustration the site already hosts, for the slicing scene.
const SLICE_ART = 'https://michi-maker.com/auto-fill-art/610758.webp';

const DIAGRAMS: Record<DiagramName, () => ReactNode> = {
  'editor-pocket': () => <EditorMapDiagram highlight="pocket" />,
  'editor-slice-new': () => <EditorMapDiagram highlight="slice-new" />,
  'editor-art-tab': () => <EditorMapDiagram highlight="art-tab" />,
  'editor-tray': () => <EditorMapDiagram highlight="tray" />,
  'editor-print': () => <EditorMapDiagram highlight="print" />,
  slice: () => <SliceDiagram src={SLICE_ART} />,
  fold: () => <FoldDiagram />,
  'true-size': () => <TrueSizeDiagram />,
  paper: () => <PaperDiagram />,
  cut: () => <CutDiagram />,
  swap: () => <SwapDiagram />,
  seed: () => <SeedDiagram />,
  'one-of-each': () => <OneOfEachDiagram />,
  'query-anatomy': () => <QueryAnatomyDiagram />,
  operators: () => <OperatorsDiagram />,
  'want-list': () => <WantListDiagram />,
};

export function GuideFigure({ figure }: { figure: GuideFigureData }) {
  const { width } = useWindowDimensions();
  if (figure.kind === 'media') return <GuideMedia src={figure.src} poster={figure.poster} alt={figure.alt} />;
  if (figure.kind === 'replay') return <EeveeReplay width={Math.min(340, width - 48)} />;
  return <>{DIAGRAMS[figure.name]()}</>;
}
