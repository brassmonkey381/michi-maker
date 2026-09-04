/**
 * NATIVE: a passthrough. Children render exactly where the caller put them.
 *
 * The web variant (TopLayer.web.tsx) is the one that does something — it lifts its children out of
 * the app and onto a layer above every modal. There is no equivalent move on iOS/Android without
 * wrapping the children in a Modal of their own, which would swallow touches for the whole screen
 * while a 5-second toast is up. michi is desktop-first, so native keeps today's behaviour rather
 * than paying that price for it.
 */
import type { ReactNode } from 'react';

export function TopLayer({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
