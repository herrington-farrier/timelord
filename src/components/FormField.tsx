import type { ReactNode } from 'react';

type Props = {
  label: string;
  /** Takes a whole form row — for fields whose content needs the width. */
  wide?: boolean;
  children: ReactNode;
};

export function FormField({ label, wide, children }: Props) {
  return (
    <label className={wide ? 'field field--wide' : 'field'}>
      <span>{label}</span>
      {children}
    </label>
  );
}
