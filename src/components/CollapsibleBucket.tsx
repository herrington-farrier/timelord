import { useId, useState, type ReactNode } from 'react';

export function CollapsibleBucket({
  title,
  hours,
  color,
  children,
  defaultOpen = false,
  liveHours,
}: {
  title: string;
  hours: string;
  color: string;
  children: ReactNode;
  defaultOpen?: boolean;
  liveHours?: (root: HTMLElement) => string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [label, setLabel] = useState<string | null>(null);
  const bodyId = useId();
  // The typed label is a preview of unsaved input. When the saved hours change
  // (or a save fails and they do not), the preview is no longer what is true,
  // so it is dropped during render rather than left to stick.
  const [seenHours, setSeenHours] = useState(hours);
  if (seenHours !== hours) {
    setSeenHours(hours);
    setLabel(null);
  }
  const displayLabel = label ?? hours;

  function refresh(root: HTMLElement) {
    if (!liveHours) return;
    const next = liveHours(root);
    if (next) setLabel(next);
  }

  return (
    <div
      className={`edit-card bucket-card${open ? ' is-open' : ''}`}
      style={{ ['--bcolor' as string]: `#${color}` }}
      onInput={(e) => refresh(e.currentTarget)}
      onChange={(e) => refresh(e.currentTarget)}
    >
      <button
        type="button"
        className="bucket-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${title}, ${displayLabel}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="bucket-toggle__name">{title}</span>
        <span className="bucket-hours">{displayLabel}</span>
      </button>
      <div id={bodyId} className="bucket-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
