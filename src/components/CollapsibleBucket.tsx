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
        <strong>{title}</strong>
        <span className="bucket-hours">{displayLabel}</span>
      </button>
      <div id={bodyId} className="bucket-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
