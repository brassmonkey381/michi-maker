/** One figure from a guide's data: a demo clip or still, or a drawn scene by name. */
import type { ReactNode } from 'react';

import {
  ArrangeDiagram,
  CsvToBinderDiagram,
  CutDiagram,
  FillPocketDiagram,
  FoldDiagram,
  OneOfEachDiagram,
  PaperDiagram,
  SeedDiagram,
  ShapesDiagram,
  SliceDiagram,
  SpreadDiagram,
  TrueSizeDiagram,
} from '@/components/learn/Diagrams';
import { GuideMedia } from '@/components/learn/GuideMedia';
import type { DiagramName, GuideFigure as GuideFigureData } from '@/data/guides';

// A card illustration the site already hosts, for the slicing scene.
const SLICE_ART = 'https://michi-maker.com/auto-fill-art/610758.webp';

const DIAGRAMS: Record<DiagramName, () => ReactNode> = {
  shapes: () => <ShapesDiagram />,
  'fill-pocket': () => <FillPocketDiagram />,
  arrange: () => <ArrangeDiagram />,
  spread: () => <SpreadDiagram />,
  slice: () => <SliceDiagram src={SLICE_ART} />,
  fold: () => <FoldDiagram />,
  'true-size': () => <TrueSizeDiagram />,
  paper: () => <PaperDiagram />,
  cut: () => <CutDiagram />,
  seed: () => <SeedDiagram />,
  'one-of-each': () => <OneOfEachDiagram />,
  'csv-to-binder': () => <CsvToBinderDiagram />,
};

export function GuideFigure({ figure }: { figure: GuideFigureData }) {
  if (figure.kind === 'media') return <GuideMedia src={figure.src} poster={figure.poster} alt={figure.alt} />;
  return <>{DIAGRAMS[figure.name]()}</>;
}
