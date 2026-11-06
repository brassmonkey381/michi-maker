/**
 * Is this a phone-sized window right now? The copy deck (scripts/copy-deck/apply.mjs) writes
 * `isPhoneWidth() ? phoneText : desktopText` when the owner gives a piece of text different
 * wording on the two screens, from code that has no `phone` flag of its own in scope. Read at
 * render time, so a phone (which never resizes) always gets its wording; a desktop window that is
 * resized across the line picks the new wording on its next render.
 */
import { Dimensions } from 'react-native';

import { PHONE_MAX_WIDTH } from '@/data/binderLayout';

export function isPhoneWidth(): boolean {
  return Dimensions.get('window').width < PHONE_MAX_WIDTH;
}
