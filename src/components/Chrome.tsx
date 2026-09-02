import { useEffect, useId, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  stamp?: string;
  wide?: boolean;
  /** Today alone runs the tighter page padding; the menu is on every page. */
  compact?: boolean;
  actions?: ReactNode;
  children: ReactNode;
};

// No Pack entry: every write that changes the schedule repacks on its own,
// either inside the callable or via the rebuild that follows it.
const NAV = [
  { to: '/', label: 'Quest' },
  { to: '/calendar', label: 'Quest Log' },
  { to: '/edit', label: 'Strategize' },
  { to: '/guide', label: 'Guide' },
  { to: '/log', label: 'Stats' },
] as const;

export function Chrome({ title, stamp, wide, compact, actions, children }: Props) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const menuId = useId();

  // Navigating always lands with the menu shut.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className={`wrap${wide ? ' cal-page' : ''}${compact ? ' wrap--compact' : ''}`}>
      <div className="title-row">
        <div className="title-left" />
        <h1 className="title-heading">
          <button
            type="button"
            className="title-toggle"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {title}
          </button>
        </h1>
        <div className="title-right">{stamp ? <span className="stamp">{stamp}</span> : null}</div>
        <nav id={menuId} className="menu-panel" aria-label="Pages" hidden={!menuOpen}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => (isActive ? 'chrome-btn is-on' : 'chrome-btn')}
            >
              {item.label}
            </NavLink>
          ))}
          {actions ? (
            <div className="menu-panel__acts" onClick={() => setMenuOpen(false)}>
              {actions}
            </div>
          ) : null}
        </nav>
      </div>
      {children}
    </div>
  );
}
