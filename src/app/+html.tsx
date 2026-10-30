import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * THE WEB PAGE AROUND THE APP. Expo Router's own template, with one change: `maximum-scale=1`.
 *
 * NO ZOOM ON A TAPPED SEARCH BOX (owner, 2026-10-29: "stop zooming into the search window on
 * mobile! it's messing up our layout and we have to manually unzoom each time"). Mobile Safari
 * zooms the page into any focused input whose text is under 16px, and the card browser's search
 * box is one; the zoom then stays, with the editor's layout sized for a viewport that is no longer
 * there. A maximum scale of 1 is the documented way to stop that zoom. iOS still allows a pinch
 * zoom with it set, so nothing is taken from anyone who needs to zoom.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
