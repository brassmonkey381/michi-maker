/**
 * One editor hint: due or not, and a way to end it for good (see data/editorHints).
 *
 * Remembered on the device. Storage that is absent or throws (a private window) reads as "seen":
 * a hint that cannot be retired must not be shown, or it would come back on every selection.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { EDITOR_HINTS, editorHintKey, type EditorHintCopy, type EditorHintId } from '@/data/editorHints';

export function useEditorHint(id: EditorHintId, due: boolean): { copy: EditorHintCopy | null; dismiss: () => void } {
  // null = not read yet. Nothing shows until the device has answered.
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(editorHintKey(id))
      .then((v) => live && setSeen(v === '1'))
      .catch(() => live && setSeen(true));
    return () => {
      live = false;
    };
  }, [id]);
  const dismiss = useCallback(() => {
    setSeen(true);
    AsyncStorage.setItem(editorHintKey(id), '1').catch(() => {});
  }, [id]);
  return { copy: seen === false && due ? EDITOR_HINTS[id] : null, dismiss };
}
