/**
 * THE BRIGHTNESS OF A MAT'S PICTURE, for an ink that follows it (matStyle.ts autoInk): one small
 * greyscale sample per picture, read once and shared by every stock card on the screen, so a
 * page of nine mats over one spread picture reads it one time. The sample is the loader's
 * (luminanceLoader, web or native); the reading under one mat's text is matStyle.ts
 * luminanceUnder, which stays pure and tested.
 */
import { useEffect, useState } from 'react';

import type { LuminanceSample } from '@/data/matStyle';
import { loadLuminanceSample } from '@/lib/luminanceLoader';

const samples = new Map<string, Promise<LuminanceSample | null>>();
const settled = new Map<string, LuminanceSample | null>();

function sampleFor(uri: string): Promise<LuminanceSample | null> {
  let p = samples.get(uri);
  if (!p) {
    p = loadLuminanceSample(uri).then((s) => {
      settled.set(uri, s);
      return s;
    });
    samples.set(uri, p);
  }
  return p;
}

/**
 * The picture's sample, null until it is read (or when it cannot be). Pass undefined for a mat
 * that does not need one; nothing is fetched.
 */
export function usePictureLuminance(uri: string | undefined): LuminanceSample | null {
  const [loaded, setLoaded] = useState<{ uri: string; sample: LuminanceSample | null } | null>(null);
  useEffect(() => {
    if (!uri || settled.has(uri)) return;
    let live = true;
    sampleFor(uri).then((s) => {
      if (live) setLoaded({ uri, sample: s });
    });
    return () => {
      live = false;
    };
  }, [uri]);
  if (!uri) return null;
  const known = settled.get(uri);
  if (known !== undefined) return known;
  return loaded && loaded.uri === uri ? loaded.sample : null;
}
