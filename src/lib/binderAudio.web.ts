/**
 * THE SOUNDTRACK PLAYER, on the web.
 *
 * One player for the whole app, module-level like the browse command bus: the binder screen tells
 * it which track the moment wants (the page's own, else the binder's, else nothing) and it does
 * the rest — crossfading between two <audio> elements when the track changes on a page turn,
 * looping the track it is on, and remembering mute across binders and visits.
 *
 * AUTOPLAY IS THE BROWSER'S CALL, NOT OURS. Sound before the visitor has interacted with the page
 * is refused everywhere, and on phones the rule is stricter. So a play is ATTEMPTED at once — it
 * succeeds when the visitor has clicked anything on this site before, which is most visitors
 * arriving from a tile — and when it is refused the player arms itself for the first pointer or
 * key event on the document and starts then. The pill shows "tap to play" in between, so the
 * silence is explained rather than mysterious.
 */
import type { PlayerState } from './binderAudio';

const FADE_MS = 900;
const MUTE_KEY = 'michi.soundtrack.muted';

type Listener = (s: PlayerState) => void;
const listeners = new Set<Listener>();

let state: PlayerState = { url: null, name: '', playing: false, muted: readMuted(), blocked: false };
let current: HTMLAudioElement | null = null;
let fading: HTMLAudioElement | null = null;
let armed = false;

function readMuted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
function writeMuted(on: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
  } catch {}
}

function emit(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

function makeAudio(url: string): HTMLAudioElement {
  const a = new Audio(url);
  a.loop = true;
  a.preload = 'auto';
  a.volume = state.muted ? 0 : 1;
  return a;
}

/** Ramp one element's volume over FADE_MS, then run `done`. */
function ramp(el: HTMLAudioElement, to: number, done?: () => void) {
  const from = el.volume;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / FADE_MS);
    el.volume = from + (to - from) * t;
    if (t < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

function armForGesture() {
  if (armed || typeof document === 'undefined') return;
  armed = true;
  const go = () => {
    armed = false;
    document.removeEventListener('pointerdown', go, true);
    document.removeEventListener('keydown', go, true);
    if (current && !state.muted) void attemptPlay(current);
  };
  document.addEventListener('pointerdown', go, true);
  document.addEventListener('keydown', go, true);
}

async function attemptPlay(el: HTMLAudioElement) {
  try {
    await el.play();
    emit({ playing: true, blocked: false });
  } catch {
    // Refused: no gesture yet. Arm for the first one and say so.
    emit({ playing: false, blocked: true });
    armForGesture();
  }
}

/** The track the moment wants. Same url: nothing happens. Different: crossfade. Null: fade out. */
export function setTrack(url: string | null, name = ''): void {
  if (url === state.url) {
    if (name !== state.name) emit({ name });
    return;
  }
  // Retire whatever is playing: fade it out and drop it.
  if (fading) {
    fading.pause();
    fading = null;
  }
  if (current) {
    const old = current;
    fading = old;
    ramp(old, 0, () => {
      old.pause();
      if (fading === old) fading = null;
    });
    current = null;
  }
  if (!url) {
    emit({ url: null, name: '', playing: false, blocked: false });
    return;
  }
  const next = makeAudio(url);
  next.volume = 0;
  current = next;
  emit({ url, name, playing: false, blocked: false });
  if (state.muted) return;
  void attemptPlay(next).then(() => {
    if (current === next && state.playing) ramp(next, 1);
  });
}

export function togglePlay(): void {
  if (!current) return;
  if (state.playing) {
    current.pause();
    emit({ playing: false });
    return;
  }
  if (state.muted) setMuted(false);
  current.volume = 1;
  void attemptPlay(current);
}

export function setMuted(muted: boolean): void {
  writeMuted(muted);
  emit({ muted });
  if (!current) return;
  if (muted) {
    current.volume = 0;
    current.pause();
    emit({ playing: false });
  } else {
    current.volume = 1;
    void attemptPlay(current);
  }
}

export function stopPlayer(): void {
  setTrack(null);
}

export function subscribePlayer(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPlayerState(): PlayerState {
  return state;
}
