/**
 * WHAT THIS PAGE WANTS PICTURES OF: the search the person last ran, the card they last placed, or
 * what the page's cards share. It seeds the free-photo search (Pexels and Pixabay) in the Add art
 * sheet and the Slice Studio. It used to lead the Find art sheet as well; that sheet, with its
 * per-site searches and how-to-copy hints, was removed on 2026-11-05 (docs/roadmap/ART-RIGHTS.md,
 * "No art-site directory"). The user brings the art; the app only searches photo libraries whose
 * terms allow the use.
 */
import { useMemo } from 'react';
import { browseState } from 'tcgscan-browse';

import { lastCardAdded, themeWordsOf } from '@/data/artLead';
import { resolveCatalogCardWith } from '@/data/cardResolver';
import { type PageSubject, pageSubject, speciesOf } from '@/data/pageArtSubject';
import { useCatalog } from '@/hooks/use-catalog';

/**
 * The subject of a page, from its card ids. Loads the catalog when `enabled` (the sheet is open),
 * the way CardPicker does on open, so an editor session that never asks never pays for it.
 */
export function usePageArtSubject(cardIds: readonly string[], title: string | null | undefined, enabled: boolean): {
  subject: PageSubject;
  loading: boolean;
} {
  const { catalog, loading } = useCatalog(enabled);
  const subject = useMemo(() => {
    const cards = cardIds
      .map((id) => resolveCatalogCardWith(catalog, id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ name: c.name, isPokemon: c.hp != null || c.cardType.some((t) => /pok[eé]mon/i.test(t)) }));
    return pageSubject(cards, title);
  }, [catalog, cardIds, title]);
  return { subject, loading: enabled && !catalog && loading };
}

/**
 * WHAT TO LOOK FOR, in the order the person most likely means it (owner, 2026-10-22): the search
 * they last ran in the card browser (its theme: or art: words), else the card they last placed,
 * else what the page's cards share, else the page title. Page titles are rarely edited by
 * players, so they come last; the curation tools that do edit them still get them.
 */
export type ArtLeadBasis = PageSubject['basis'] | 'search' | 'added';

export function useArtLead(cardIds: readonly string[], title: string | null | undefined, enabled: boolean): {
  query: string;
  label: string;
  basis: ArtLeadBasis;
  loading: boolean;
} {
  const { catalog, loading } = useCatalog(enabled);
  const page = usePageArtSubject(cardIds, title, enabled);
  const searched = themeWordsOf(browseState.cardQuery);
  const addedId = lastCardAdded();
  return useMemo(() => {
    if (searched) return { query: searched, label: searched, basis: 'search' as const, loading: false };
    const added = addedId ? resolveCatalogCardWith(catalog, addedId) : null;
    const species = added ? speciesOf(added.name)[0] : '';
    if (species) return { query: species, label: added!.name, basis: 'added' as const, loading: false };
    if (addedId && !catalog && loading) return { query: '', label: '', basis: 'none' as const, loading: true };
    return { query: page.subject.query, label: page.subject.label, basis: page.subject.basis, loading: page.loading };
  }, [searched, addedId, catalog, loading, page]);
}
