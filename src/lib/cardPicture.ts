/**
 * THE CARD AS A PICTURE (owner, 2026-11-06; everywhere the card sheet opens since MIC-032).
 *
 * Full resolution on a mat with our mark, to the phone's share sheet, the clipboard or a file
 * (lib/pageImage). Web only: a canvas draws it. One action for every surface that opens the browse
 * kit's card sheet (Browse All Cards, the editor's Add to pocket, the new-binder wizard), so the
 * picture, its wording and its `card.picture` event are the same wherever a card is opened.
 */
import { getPriceSummary, type CardAction } from 'tcgscan-browse';
import { Platform } from 'react-native';

import { BinderSurface } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { buildCardImage, pageImageFileName, sharePageImage } from '@/lib/pageImage';

/** Where the sheet was opened, for `card.picture`'s `surface` (browse | picker | wizard). */
export type CardPictureSurface = 'browse' | 'picker' | 'wizard';

export function cardPictureAction(surface: CardPictureSurface, toast: (message: string) => void): CardAction {
  return {
    key: 'picture',
    label: 'Share picture',
    available: () => Platform.OS === 'web',
    onPress: (c) => {
      void (async () => {
        try {
          const prices = await getPriceSummary().catch(() => ({}) as Record<string, { cur: number }>);
          const blob = await buildCardImage({
            cardId: c.id,
            name: c.name,
            caption: `${c.setName} · ${c.number}`,
            illustrator: c.illustrator || undefined,
            price: prices[c.id]?.cur ?? null,
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            mat: BinderSurface.mat,
          });
          const out = await sharePageImage(blob, pageImageFileName(c.name, 0).replace(/-page-0/, ''), `${c.name} · https://michi-maker.com`);
          track('card.picture', { via: out, surface });
          if (out === 'copied') toast('Picture copied. Paste it anywhere.');
          else if (out === 'saved') toast('Picture saved.');
        } catch {
          toast('The picture did not draw. Try again in a moment.');
        }
      })();
    },
  };
}
