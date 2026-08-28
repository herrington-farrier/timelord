import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  stamp?: string;
  wide?: boolean;
  actions?: ReactNode;
  children: ReactNode;
};

const NAV = [
  { to: '/', label: 'Today' },
  { to: '/calendar', label: '3-week' },
  { to: '/edit', label: 'Edit' },
  { to: '/log', label: 'Log' },
] as const;

export function Chrome({ title, stamp, wide, actions, children }: Props) {
  return (
    <div className={wide ? 'wrap cal-page' : 'wrap'}>
      <div className="title-row">
        <nav className="title-left" aria-label="Pages">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'chrome-btn is-on' : 'chrome-btn')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <h1 className="title-heading">{title}</h1>
        <div className="title-right">
          {actions}
          <span className="stamp">{stamp}</span>
        </div>
      </div>
      {children}
    </div>
  );
}
