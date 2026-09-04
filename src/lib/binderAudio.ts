/**
 * THE SOUNDTRACK PLAYER — native passthrough. michi-maker ships on the web; the web variant
 * (binderAudio.web.ts) is the one that plays anything. Here every call is a no-op and the state
 * reads as silent, so screens can render the same controls without branching on the platform.
 */
export interface PlayerState {
  /** The track the player is on, or null when silent. */
  url: string | null;
  name: string;
  playing: boolean;
  muted: boolean;
  /** True when a play was attempted and refused (no user gesture yet): the pill says "tap to play". */
  blocked: boolean;
}

const SILENT: PlayerState = { url: null, name: '', playing: false, muted: false, blocked: false };

export function setTrack(_url: string | null, _name = ''): void {}
export function togglePlay(): void {}
export function setMuted(_muted: boolean): void {}
export function stopPlayer(): void {}
export function subscribePlayer(_listener: (s: PlayerState) => void): () => void {
  return () => {};
}
export function getPlayerState(): PlayerState {
  return SILENT;
}
