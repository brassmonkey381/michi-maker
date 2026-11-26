/**
 * MIC-073: the holiday trial for the current visitor. The server decides (stripe-checkout
 * "holiday_status"); a guest is shown the offer, since a new account is always eligible.
 * One read per signed-in account per visit; web only, like every purchase.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { fetchHolidayStatus, type HolidayStatus } from '@/data/checkout';
import { holidayActive } from '@/data/holiday';
import { useAuth } from '@/store/auth';

const cache = new Map<string, Promise<HolidayStatus>>();
const OFF: HolidayStatus = { active: false, eligible: false, onHolidayTrial: false, endsAt: null };

export function useHolidayTrial(): HolidayStatus & { loading: boolean } {
  const { user, isSignedIn } = useAuth();
  const on = Platform.OS === 'web' && holidayActive();
  const uid = isSignedIn ? (user?.id ?? null) : null;
  const [state, setState] = useState<{ uid: string | null; status: HolidayStatus } | null>(null);

  useEffect(() => {
    if (!on || !uid) return;
    let live = true;
    let p = cache.get(uid);
    if (!p) {
      p = fetchHolidayStatus();
      cache.set(uid, p);
    }
    void p.then((status) => live && setState({ uid, status }));
    return () => {
      live = false;
    };
  }, [on, uid]);

  if (!on) return { ...OFF, loading: false };
  if (!uid) return { active: true, eligible: true, onHolidayTrial: false, endsAt: null, loading: false };
  if (!state || state.uid !== uid) return { ...OFF, active: true, loading: true };
  return { ...state.status, loading: false };
}
