import type { ReactNode } from 'react';

type Props = {
  label: string;
  children: ReactNode;
};

export function FormField({ label, children }: Props) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
