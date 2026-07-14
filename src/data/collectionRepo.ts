/**
 * Supabase access for the collector's card inventory (`user_cards`) — the portfolio summary
 * fed by tcgscan-app scans (and, later, michi's own CSV import). Read-only from michi's side
 * for now; RLS scopes every query to the signed-in user. See docs/TCGSCAN-PORTFOLIO.md.
 */
import { requireSupabase } from '@/lib/supabase';

/** One inventory line: a card the user owns (per condition), with a quantity. */
export interface UserCard {
  cardId: string;
  condition: string;
  quantity: number;
  source: string;
  updatedAt: string;
}

/** The signed-in user's inventory, most recently touched first (RLS scopes to the owner). */
export async function fetchUserCards(): Promise<UserCard[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('user_cards')
    .select('card_id, condition, quantity, source, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`user cards: ${error.message}`);
  return ((data ?? []) as {
    card_id: string;
    condition: string;
    quantity: number;
    source: string;
    updated_at: string;
  }[]).map((r) => ({
    cardId: r.card_id,
    condition: r.condition,
    quantity: r.quantity,
    source: r.source,
    updatedAt: r.updated_at,
  }));
}

/**
 * Live changes to the user's inventory (scan-to-screen): calls `onChange` on any insert /
 * update / delete of their rows. Returns an unsubscribe. The publication includes user_cards
 * (20260714150000) and RLS keeps the stream owner-only.
 */
export function subscribeUserCards(userId: string, onChange: () => void): () => void {
  const supabase = requireSupabase();
  const channel = supabase
    .channel(`user_cards:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_cards', filter: `owner_id=eq.${userId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
