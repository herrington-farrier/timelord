/**
 * DEBUG TOASTS — a temporary diagnostic layer.
 *
 * The app deliberately has no toasts: a save confirms itself by re-rendering,
 * and a failure shows beside the control that failed. That design has a hole —
 * a page that forgets to render its error swallows the failure entirely, which
 * is how a denied save looked identical to a save that did nothing.
 *
 * This reports every callable by name, with the raw error rather than the
 * friendly one, so a failure can be told apart from a no-op. Remove this file,
 * `Toasts.tsx`, the reporting in `services/api.ts`, and the DEBUG block in
 * `global.css` to put it back the way it was.
 */

export type ToastKind = 'ok' | 'fail';

export type Toast = {
  id: string;
  kind: ToastKind;
  /** The callable's name — what was attempted. */
  label: string;
  /** The raw failure, or a short note on success. */
  detail?: string;
  ms?: number;
  at: number;
};

/** Enough to see a save and its follow-up rebuild, not enough to bury the page. */
const MAX = 8;

/** A success is confirmation and can go on its own. A failure is the thing
 *  being hunted, so it stays until it is read. */
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

export function pushToast(kind: ToastKind, label: string, detail?: string, ms?: number): string {
  seq += 1;
  const id = `t${seq}`;
  toasts = [{ id, kind, label, detail, ms, at: Date.now() }, ...toasts].slice(0, MAX);
  emit();
  if (kind === 'ok') {
    setTimeout(() => dismissToast(id), OK_TTL_MS);
  }
  return id;
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

/**
 * The raw failure, not the friendly one. `formatActionError` maps
 * permission-denied to "invite-only." and drops the server's own sentence,
 * which is the sentence that says whether a save was refused or rejected.
 */
export function describeError(err: unknown): string {
  const parts: string[] = [];
  const e = err as { code?: unknown; message?: unknown; details?: unknown };
  if (typeof e?.code === 'string' && e.code) parts.push(e.code);
  const message = typeof e?.message === 'string' && e.message ? e.message : String(err);
  parts.push(message);
  if (e?.details != null) {
    try {
      parts.push(JSON.stringify(e.details));
    } catch {
      // a details object that will not serialise is not worth failing over
    }
  }
  return parts.join(' · ');
}

/** One line per toast, for pasting into a bug report from a phone. */
export function toastsAsText(rows: Toast[] = toasts): string {
  return rows
    .map((t) => {
      const when = new Date(t.at).toISOString().slice(11, 19);
      const ms = t.ms == null ? '' : ` (${t.ms}ms)`;
      return `${when} ${t.kind === 'ok' ? 'OK' : 'FAIL'} ${t.label}${ms}${t.detail ? ` — ${t.detail}` : ''}`;
    })
    .join('\n');
}
