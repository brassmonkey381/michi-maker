/** MIC-041: the profile's "Show my lists on my profile" switch (profiles.show_lists, off by default). */
import { useEffect, useState } from 'react';

import { fetchShowLists, setShowLists } from '@/data/listsRepo';
import { useAuth } from '@/store/auth';

export function useShowLists(): { on: boolean; busy: boolean; set: (on: boolean) => void } {
  const { user } = useAuth();
  const userId = user && !user.is_anonymous ? user.id : null;
  const [state, setState] = useState<{ userId: string | null; on: boolean }>({ userId: null, on: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchShowLists(userId)
      .then((on) => {
        if (live) setState({ userId, on });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId]);

  const on = state.userId === userId ? state.on : false;
  const set = (next: boolean) => {
    if (!userId) return;
    setBusy(true);
    setState({ userId, on: next });
    setShowLists(userId, next)
      .catch(() => setState({ userId, on: !next }))
      .finally(() => setBusy(false));
  };
  return { on, busy, set };
}
