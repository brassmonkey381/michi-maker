/**
 * The ✨ beside a name or description (MIC-034 part 2): three options from the name-ideas edge
 * function. The facts are text the device already worked out (data/autoNames.factsText).
 */
import { track } from '@/lib/analytics';
import { DEV_MODE } from '@/lib/devMode';
import { requireSupabase } from '@/lib/supabase';

export type NameIdeasResult = { options: string[] } | { limit: 'account' | 'subject' } | { failed: true };

export async function askNameIdeas(args: { kind: 'page' | 'binder'; field: 'title' | 'description'; subjectId: string; facts: string }): Promise<NameIdeasResult> {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase.functions.invoke<{ options?: string[]; error?: string; which?: 'account' | 'subject' }>('name-ideas', { body: { ...args, dev: DEV_MODE } });
    if (error) {
      // A 429 arrives as an error whose context is the response; read the cap it names.
      const ctx = (error as { context?: Response }).context;
      if (ctx && ctx.status === 429) {
        const body = (await ctx.json().catch(() => null)) as { which?: 'account' | 'subject' } | null;
        const which = body?.which === 'subject' ? 'subject' : 'account';
        // A refused press writes no server row; this makes refusals visible (analytics-studio ask).
        track('names.ideas_limit', { which, kind: args.kind, field: args.field });
        return { limit: which };
      }
      return { failed: true };
    }
    return data?.options?.length ? { options: data.options.slice(0, 3) } : { failed: true };
  } catch {
    return { failed: true };
  }
}
