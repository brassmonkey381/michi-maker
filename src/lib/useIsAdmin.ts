/**
 * Is the signed-in person an admin (the owner)? The same gate /studio uses: the loaded profile's
 * `is_admin` as the fast path, confirmed by the security-definer `is_admin()` RPC. Null while it
 * is being decided, so a page can wait instead of flashing "not found" at the owner.
 *
 * A UI gate only. Whatever a gated page reads must be readable (or refused) by the server on its
 * own terms; the labs (MIC-080) read only what a visitor's key already can.
 */
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

export function useIsAdmin(): boolean | null {
  const { profile, user, ready } = useAuth();
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!ready) return; // the session is still being restored: decide nothing yet
      if (profile?.is_admin) {
        if (active) setOk(true);
        return;
      }
      if (!supabase || !user) {
        if (active) setOk(false);
        return;
      }
      try {
        const { data } = await supabase.rpc('is_admin');
        if (active) setOk(data === true);
      } catch {
        if (active) setOk(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.is_admin, user, ready]);
  return ok;
}
