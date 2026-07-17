/**
 * `/subscriptions` → `/plans` (renamed by owner call, 2026-07-17; /pricing chains here too).
 * The redirect keeps old links, bookmarks, and Stripe return URLs working.
 */
import { Redirect } from 'expo-router';

export default function SubscriptionsRedirect() {
  return <Redirect href="/plans" />;
}
