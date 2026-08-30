export function formatLogEvent(row: {
  type?: string;
  title?: string;
  section?: string;
  minutes?: number;
}): string {
  const title = row.title?.trim();
  if (row.type === 'rebuild') return 'Schedule packed';
  if (row.type === 'complete') return title ? `Completed ${title}` : 'Completed';
  if (row.type === 'skip') return title ? `Skipped ${title}` : 'Skipped';
  if (row.type === 'start_day') return 'Started the day';
  if (row.type === 'start_next') return 'Started next buckets';
  if (row.type === 'end_day') return 'Ended the day';
  if (row.type === 'start_break') return 'Started break';
  if (row.type === 'end_break') return 'Ended break';
  if (row.type === 'appointment_stop') return title ? `Stopped ${title}` : 'Stopped appointment';
  if (row.type === 'reset_today') return 'Reset today';
  if (row.type === 'reset_bucket') return 'Bucket reset';
  if (row.type === 'wipe_account') return 'Account wiped';
  if (row.type === 'event_hours') return 'Event hours';
  return String(row.type || 'Event');
}

export function logEventTone(type?: string): 'ok' | 'skip' | 'pack' | '' {
  if (type === 'complete') return 'ok';
  if (type === 'skip') return 'skip';
  if (type === 'rebuild') return 'pack';
  return '';
}
