/**
 * `/pricing` → `/subscriptions`. The page was renamed (owner call, 2026-07-16); this redirect
 * keeps old links, bookmarks, and any indexed URLs working.
 */
import { Redirect } from 'expo-router';

export default function PricingRedirect() {
  return <Redirect href="/subscriptions" />;
}
