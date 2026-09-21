/**
 * PREVIEW YOUR PRINT, off the web: nothing. The fill sheets are built and downloaded in a browser
 * (the print sheet says so on a phone), so the watermarked preview lives there too. See
 * PrintPreview.web.tsx.
 */
import type { ReactNode } from 'react';

import type { FillSheetPdf } from '@/data/placeholderPdf';

export function PrintPreview(_props: {
  files: FillSheetPdf[] | null;
  preparing: boolean;
  error: string | null;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return null;
}
