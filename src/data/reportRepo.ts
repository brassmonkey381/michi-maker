/**
 * Filing a content report on a PUBLIC binder — the in-app takedown intake (see
 * docs/roadmap/ART-RIGHTS.md + supabase/migrations/20260717170000_content_reports.sql).
 *
 * Insert-only from the client (RLS `to authenticated`; guests are anonymous-authenticated so they
 * can file too). Reports are read/resolved by the service role — there's no client read path.
 */
import { requireSupabase } from '@/lib/supabase';

export type ReportReason = 'copyright' | 'inappropriate' | 'other';

/** What is being reported: a binder, or a profile (bio, avatar). Exactly one id. */
export type ReportTarget = { binderId: string; profileId?: never } | { binderId?: never; profileId: string };

export async function submitContentReport(
  target: ReportTarget,
  reason: ReportReason,
  details: string,
): Promise<void> {
  const supabase = requireSupabase();
  // reporter_id defaults to auth.uid() server-side (same pattern as print_events / saved_slices);
  // subject_owner_id is snapshotted by trigger.
  const { error } = await supabase.from('content_reports').insert({
    binder_id: target.binderId ?? null,
    profile_id: target.profileId ?? null,
    reason,
    details: details.trim() || null,
  });
  if (error) throw error;
}

// --- admin (is_admin accounts only; RLS returns nothing for anyone else) ----

/** A report as /studio works it. */
export interface AdminReport {
  id: string;
  binderId: string | null;
  profileId: string | null;
  subjectOwnerId: string | null;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
}

/** One repeat-infringer row: actioned copyright reports per content owner. */
export interface CopyrightStrike {
  ownerId: string;
  username: string | null;
  strikes: number;
  lastAt: string;
}

/** Reports for the /studio queue, open first, newest first within a status. */
export async function adminListReports(limit = 100): Promise<AdminReport[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('content_reports')
    .select('id, binder_id, profile_id, subject_owner_id, reason, details, status, created_at')
    .order('status', { ascending: false }) // 'open' sorts after 'actioned'/'dismissed' desc
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`list reports: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    binderId: r.binder_id,
    profileId: r.profile_id,
    subjectOwnerId: r.subject_owner_id,
    reason: r.reason,
    details: r.details,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** Resolve a report without touching the content (dismissed) or after acting outside the app. */
export async function adminSetReportStatus(
  id: string,
  status: 'open' | 'actioned' | 'dismissed',
): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('content_reports').update({ status }).eq('id', id);
  if (error) throw new Error(`update report: ${error.message}`);
}

/**
 * Take a binder down (removed_at). Hidden from every public surface, still visible to its owner;
 * the binder's open reports flip to actioned server-side. Reversible via adminRestoreBinder.
 */
export async function adminRemoveBinder(binderId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('admin_remove_binder', { p_binder_id: binderId });
  if (error) throw new Error(`remove binder: ${error.message}`);
}

export async function adminRestoreBinder(binderId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('admin_restore_binder', { p_binder_id: binderId });
  if (error) throw new Error(`restore binder: ${error.message}`);
}

/** The repeat-infringer ledger behind the DMCA page's suspension sentence. */
export async function adminCopyrightStrikes(): Promise<CopyrightStrike[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_copyright_strikes');
  if (error) throw new Error(`copyright strikes: ${error.message}`);
  return (data ?? []).map((r) => ({
    ownerId: r.owner_id,
    username: r.username,
    strikes: Number(r.strikes) || 0,
    lastAt: r.last_at,
  }));
}
