/**
 * Toasts: how a failed action reaches the person who tapped it.
 *
 * Every user-initiated mutation reports a failure here, through
 * `toastFailure`, with a verb-noun label that matches the control ("Start
 * Quest", "Save Lists"). The text is the friendly one from
 * `formatActionError`, never the raw callable error. A success stays silent:
 * the page re-renders from live data, which is the confirmation. The few
 * exceptions push a short `ok` toast themselves (Respawn).
 *
 * A listener the server refuses reports here too, from `services/live.ts`.
 */

import { formatActionError } from './formatActionError';

export type ToastKind = 'ok' | 'fail';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  at: number;
};

/** Enough to see a save and its follow-up, not enough to bury the page. */
const MAX = 8;

/** A success is confirmation and can go on its own. A failure stays until it is read. */
const OK_TTL_MS = 5000;

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function subscribeToasts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Identity-stable between emits, so useSyncExternalStore does not loop. */
export function getToasts(): Toast[] {
  return toasts;
}

export function pushToast(kind: ToastKind, message: string): string {
  // The same failure already on screen is not stacked again (a refused listener
  // can fire on every retry).
  const same = kind === 'fail' ? toasts.find((t) => t.kind === kind && t.message === message) : undefined;
  if (same) return same.id;
  seq += 1;
  const id = `t${seq}`;
  toasts = [{ id, kind, message, at: Date.now() }, ...toasts].slice(0, MAX);
  emit();
  if (kind === 'ok') {
    setTimeout(() => dismissToast(id), OK_TTL_MS);
  }
  return id;
}

/** Shows a failed action as `<label>: <reason>`. `label` is the control's verb-noun name. */
export function toastFailure(err: unknown, label: string): string {
  return pushToast('fail', formatActionError(err, label));
}

export function dismissToast(id: string): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export function clearToasts(): void {
  if (!toasts.length) return;
  toasts = [];
  emit();
}
