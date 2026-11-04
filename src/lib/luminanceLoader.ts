/**
 * A picture reduced to a small greyscale grid (matStyle.ts LuminanceSample) — native. There is
 * no canvas to read pixels from, so a mat whose ink follows the picture keeps its chosen ink
 * on a phone; the web and the share image read the picture. See luminanceLoader.web.ts.
 */
import type { LuminanceSample } from '@/data/matStyle';

export async function loadLuminanceSample(_uri: string): Promise<LuminanceSample | null> {
  return null;
}
