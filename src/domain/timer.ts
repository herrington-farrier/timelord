export function sectionRemainingNow(
  remainingMinutes: number,
  startedAt: string | null | undefined,
  pausedAt: string | null | undefined,
  nowMs: number
): number {
  if (!startedAt || pausedAt) return Math.max(0, remainingMinutes);
  const elapsed = (nowMs - Date.parse(startedAt)) / 60000;
  return Math.max(0, remainingMinutes - elapsed);
}

export function elapsedSince(startedAt: string, nowMs: number): number {
  return Math.max(0, (nowMs - Date.parse(startedAt)) / 60000);
}
