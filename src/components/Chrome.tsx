import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { api } from '../services/api';
import { todayKey } from '../shared/dates';
import { formatActionError } from '../shared/formatActionError';
import { useToast } from '../shared/toast';

type Props = {
  title: string;
  stamp?: string;
  wide?: boolean;
  actions?: ReactNode;
  children: ReactNode;
};

const NAV = [
  { to: '/', label: 'Today' },
  { to: '/calendar', label: '2-week' },
  { to: '/edit', label: 'Edit' },
  { to: '/guide', label: 'Guide' },
  { to: '/log', label: 'Log' },
] as const;

export function packBarVisible(pathname: string): boolean {
  return pathname !== '/' && pathname !== '/guide';
}

export function Chrome({ title, stamp, wide, actions, children }: Props) {
  const { pathname } = useLocation();
  const { showToast } = useToast();
  const showPack = packBarVisible(pathname);

  async function pack() {
    try {
      await api.rebuildRange({ start: todayKey(), days: 21 });
      showToast('Packed.', 'success');
    } catch (err) {
      console.error(err);
      showToast(formatActionError(err, 'Packed'), 'error');
    }
  }

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
      {showPack ? (
        <div className="pack-bar">
          <button type="button" className="primary" onClick={() => pack()}>
            Pack the Day
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
