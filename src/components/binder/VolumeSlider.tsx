/**
 * The soundtrack's volume dial — native: nothing to show.
 *
 * The player is a silent stub off the web (binderAudio.ts), so there is no level to set. A control
 * that moves and changes nothing is worse than no control, and the alternative — a real slider —
 * would mean a native module and therefore a new build (docs/EAS-NEXT-BUILD.md) for a dial with no
 * sound behind it. See VolumeSlider.web.tsx.
 */
export function VolumeSlider(_props: { volume: number; onChange: (v: number) => void }) {
  return null;
}
