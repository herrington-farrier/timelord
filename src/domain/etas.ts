import { type PackedBlock } from './types';

function bucketChanged(prev: PackedBlock | undefined, next: PackedBlock): boolean {
  if (!prev) return false;
  return prev.bucketId !== next.bucketId && prev.kind !== 'transition' && next.kind !== 'transition';
}

/**
 * After Start Day, pending flexible blocks chain from `nowMinutes`.
 * Appointments never move. Flexible blocks wait if they would overlap an appointment.
 */
export function recomputeEtas(
  blocks: PackedBlock[],
  nowMinutes: number,
  transitionMinutes: number
): PackedBlock[] {
  const ordered = blocks
    .slice()
    .sort((a, b) => a.startMinutes - b.startMinutes || a.title.localeCompare(b.title));
  const frozen = ordered.filter((b) => !b.flexible || b.kind === 'appointment' || b.status === 'complete' || b.status === 'skipped');
  const out: PackedBlock[] = [];
  let cursor = nowMinutes;
  let prevFlexible: PackedBlock | undefined;

  for (const block of ordered) {
    if (block.kind === 'transition') continue;
    if (!block.flexible || block.kind === 'appointment' || block.status === 'complete' || block.status === 'skipped') {
      out.push({ ...block });
      if (block.endMinutes > cursor && (block.kind === 'appointment' || block.status === 'complete')) {
        cursor = Math.max(cursor, block.endMinutes);
      }
      continue;
    }

    const nextFrozen = frozen.find((f) => f.startMinutes >= cursor && f.kind === 'appointment');
    let start = cursor;
    if (bucketChanged(prevFlexible, block)) start += transitionMinutes;
    if (nextFrozen && start + block.durationMinutes > nextFrozen.startMinutes) {
      start = Math.max(start, nextFrozen.endMinutes);
      if (bucketChanged(nextFrozen, block)) start += transitionMinutes;
    }
    const updated = {
      ...block,
      startMinutes: start,
      endMinutes: start + block.durationMinutes,
    };
    out.push(updated);
    cursor = updated.endMinutes;
    prevFlexible = updated;
  }

  return out.sort((a, b) => a.startMinutes - b.startMinutes);
}
