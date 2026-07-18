/**
 * Filing a content report on a PUBLIC binder — the in-app takedown intake (see
 * docs/roadmap/ART-RIGHTS.md + supabase/migrations/20260717170000_content_reports.sql).
 *
 * Insert-only from the client (RLS `to authenticated`; guests are anonymous-authenticated so they
 * can file too). Reports are read/resolved by the service role — there's no client read path.
 */
import { requireSupabase } from '@/lib/supabase';

export type ReportReason = 'copyright' | 'inappropriate' | 'other';

export async function submitContentReport(
  binderId: string,
  reason: ReportReason,
  details: string,
): Promise<void> {
  const supabase = requireSupabase();
  // reporter_id defaults to auth.uid() server-side (same pattern as print_events / saved_slices).
  const { error } = await supabase
    .from('content_reports')
    .insert({ binder_id: binderId, reason, details: details.trim() || null });
  if (error) throw error;
}
