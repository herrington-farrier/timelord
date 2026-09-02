import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Native <dialog>, so focus trapping, Escape and the backdrop come from the
 * browser rather than being reimplemented.
 */
export function ConfirmDialog({ open, title, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="confirm" onCancel={onCancel} onClose={onCancel}>
      <p className="confirm__title">{title}</p>
      <div className="confirm__acts">
        <button type="button" className="btn--gold" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn--red" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
