/**
 * THE DOC ROUTES' FRAME, on the shared page shell (tcgscan-ui, since the page-shell branch,
 * 2026-11-07). Pricing, legal, learn, what's new, feedback and the rest call this with the same
 * props they always did; what changed is what draws them: the kit's Shell (the column at
 * 800 / 960 / 1440, the back row, the one-line doc header, the footer slot) in michi's skin
 * (components/layout/AppKit).
 *
 * Two steps on purpose. A route that passes only `title` keeps its own h1 and lede in the page
 * and gets the frame alone, so nothing moves until it is looked at. A route that passes `heading`
 * hands its title line to the shell's doc header (and `lede` to the line under it) and drops its
 * own; that is the second pass, one route at a time.
 *
 * The site's rail and the phone menu still come from the root layout (AppRail, MobileNav), so the
 * shell draws no nav of its own here; that slice comes when the home page moves.
 *
 * On web it also sets the document title and meta description via expo-router/head.
 */
import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { Shell, type FrameWidth, type HeaderProps } from 'tcgscan-ui';

import { SiteFooter } from '@/components/layout/SiteFooter';
import { MaxContentWidth, MaxContentWidthDoc, MaxContentWidthWide } from '@/constants/theme';

/** The kit's three column widths, from the number a route has always passed. */
function frameWidth(maxWidth: number): FrameWidth {
  if (maxWidth >= MaxContentWidthWide) return 'wide';
  if (maxWidth >= MaxContentWidthDoc) return 'doc';
  return 'prose';
}

export function PageShell({
  title,
  description,
  maxWidth = MaxContentWidth,
  footer = true,
  heading,
  lede,
  header,
  ground,
  back = true,
  keyboardShouldPersistTaps,
  children,
}: {
  /** Browser tab / SEO title (web only). */
  title?: string;
  /** Meta description (web only). */
  description?: string;
  /** Content column cap; pricing passes MaxContentWidthWide for its card row. */
  maxWidth?: number;
  /** Render the shared SiteFooter after the content. */
  footer?: boolean;
  /** The page's title line, drawn by the shell's doc header. A route that passes it drops its own h1. */
  heading?: string;
  /** The line under the heading, drawn by the shell. */
  lede?: string;
  /** The whole header, for a route that needs tools or buttons on the title line (a workbench). */
  header?: Omit<HeaderProps, 'compact'>;
  /** A layer behind the column for this page alone (Daily Puzzle's faint backdrop picture). */
  ground?: ReactNode;
  /** False on a top-level page (Home, My Binders), which has nowhere to go back to. */
  back?: boolean;
  /** 'handled' on a page with a search field: a tap on a result works with the keyboard up. */
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  children: ReactNode;
}) {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.push('/'));
  const shellHeader = header ?? (heading ? { variant: 'doc' as const, title: heading, lede } : undefined);

  return (
    <>
      {Platform.OS === 'web' && title ? (
        <Head>
          <title>{`${title} · Michi-Maker`}</title>
          {description ? <meta name="description" content={description} /> : null}
        </Head>
      ) : null}
      <Shell
        header={shellHeader}
        width={frameWidth(maxWidth)}
        back={back ? { label: 'Back', onPress: goBack } : undefined}
        ground={ground}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        footer={footer ? <SiteFooter /> : undefined}>
        {children}
      </Shell>
    </>
  );
}
