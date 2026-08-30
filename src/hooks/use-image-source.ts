/**
 * WHICH PICTURE OF A CARD the app is showing: the owner's own scan, or the catalogue art.
 *
 * One choice, shared by every surface that can show either — the collection strip today, a binder's
 * pockets and the browser next. It is a preference about how the user wants to SEE their cards, not
 * a per-screen widget, and a person who turned their photos on in one place has already answered
 * the question everywhere else.
 *
 * SESSION-STICKY, MODULE-LEVEL, deliberately not persisted: the same pattern as the collection's
 * view mode and the binder's double-sided toggle. It survives navigating between screens, which is
 * the whole point, and resets on a reload, which keeps a first visit showing catalogue art — the
 * only images a page can be sure it has.
 *
 * CATALOGUE IS THE DEFAULT because it is the one that always resolves. A scan can 404 while its
 * upload is in flight, and every scan-showing surface falls back to catalogue art anyway; starting
 * there means the first paint is never a wall of placeholders.
 */
import { useCallback, useState } from 'react';

export type ImageSource = 'scans' | 'catalog';

let imageSourcePref: ImageSource = 'catalog';

/** `[source, setSource]`, shared across screens for the life of the session. */
export function useImageSource(): [ImageSource, (next: ImageSource) => void] {
  const [source, setSource] = useState<ImageSource>(imageSourcePref);
  const choose = useCallback((next: ImageSource) => {
    // The write rides inside the updater so the module value and the React state can never
    // disagree about what was chosen (and so the compiler lint is satisfied).
    setSource(() => {
      imageSourcePref = next;
      return next;
    });
  }, []);
  return [source, choose];
}
