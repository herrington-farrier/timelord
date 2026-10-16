import type { PackedBlock } from './types';

export type DayScore = {
  completed: number;
  skipped: number;
  /** What this day adds to (or takes off) the running total. */
  delta: number;
};

export type DayScoreContext = {
  /** Nothing counts on a day you never opened. */
  started: boolean;
  /** Event days and days holding appointments forgive what fell off. */
  isEventDay: boolean;
  hasAppointments: boolean;
};

const NOTHING: DayScore = { completed: 0, skipped: 0, delta: 0 };

/** A finished item is worth one; one that had no room in the day is worth two. */
export const POINT = 1;
export const FALLEN_BONUS = 1;

/**
 * One point per item you finished, one off per item you skipped. Adherence, not
 * volume — a 15-minute chore and a three-hour block are each worth one, because
 * the score is about staying on the plan rather than how big the plan was.
 *
 * Finishing something that had already fallen off is worth an extra point: the
 * day had no room for it and you did it anyway. An overbooked day therefore has
 * a way back rather than only a way down.
 *
 * Two things never count against you:
 *  - a day you never started, which is a day off rather than a failure;
 *  - work that fell off a day with appointments or an event, where the schedule
 *    squeezed it out and no amount of adherence would have saved it.
 */
export function scoreDay(
  blocks: PackedBlock[],
  dropped: PackedBlock[],
  ctx: DayScoreContext
): DayScore {
  if (!ctx.started) return NOTHING;
  const scoreable = (b: PackedBlock) => Boolean(b.itemId) && b.kind !== 'transition';
  const forgiven = ctx.isEventDay || ctx.hasAppointments;

  /**
   * One item, one point. A Work item split around Break is two blocks, each
   * tickable on its own, but it scores complete only once every half is, and
   * skipped as soon as any half is.
   */
  const outcomes = (rows: PackedBlock[]) => {
    const byItem = new Map<string, PackedBlock[]>();
    for (const b of rows.filter(scoreable)) {
      const key = b.itemId as string;
      byItem.set(key, [...(byItem.get(key) || []), b]);
    }
    let complete = 0;
    let skip = 0;
    for (const halves of byItem.values()) {
      if (halves.some((b) => b.status === 'skipped')) skip += 1;
      else if (halves.every((b) => b.status === 'complete')) complete += 1;
    }
    return { complete, skip };
  };
  const inPlan = outcomes(blocks);
  // Falling-off items live in `dropped`, whatever they end up as.
  const fallen = outcomes(dropped);
  const completedInPlan = inPlan.complete;
  const completedFallen = fallen.complete;
  const skippedInPlan = inPlan.skip;
  // On a constrained day, what fell off is free.
  const skippedFallen = forgiven ? 0 : fallen.skip;

  const completed = completedInPlan + completedFallen;
  const skipped = skippedInPlan + skippedFallen;
  const delta = completed * POINT + completedFallen * FALLEN_BONUS - skipped * POINT;

  return { completed, skipped, delta };
}

/** A day holds appointments if anything on it was one; a cancelled one does not count. */
export function dayHasAppointments(blocks: PackedBlock[]): boolean {
  return blocks.some((b) => b.kind === 'appointment' && b.status !== 'skipped');
}

/** The score never runs below zero, so the bar always has somewhere to sit. */
export function applyDelta(total: number, delta: number): number {
  return Math.max(0, Math.round(Number(total) || 0) + Math.round(Number(delta) || 0));
}

/** Arbitrary by design: the bar fills every hundred and starts again. */
export const SCORE_BAND = 100;

export function scoreBand(total: number): { level: number; into: number; pct: number } {
  const score = Math.max(0, Math.round(Number(total) || 0));
  const level = Math.floor(score / SCORE_BAND) + 1;
  const into = score % SCORE_BAND;
  return { level, into, pct: (into / SCORE_BAND) * 100 };
}
