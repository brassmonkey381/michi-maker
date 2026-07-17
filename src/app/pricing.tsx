/**
 * `/pricing` → `/plans` (renamed twice: pricing → subscriptions → plans); this redirect
 * keeps old links, bookmarks, and any indexed URLs working.
 */
import { Redirect } from 'expo-router';

export default function PricingRedirect() {
  return <Redirect href="/plans" />;
}
