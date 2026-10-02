import { useQuery } from '@tanstack/react-query';
import {
  Bike,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Search,
  ShieldCheck,
  Store,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { api, signOut } from '../lib/api';
import { ADMIN_ROLE, initials } from '../lib/format';
import { usePanels } from '../lib/panels';
import { can, useUser, type Capability } from '../lib/session';
import type { Dashboard } from '../lib/types';
import { PanelHost } from '../panels/PanelHost';
import { CommandPalette } from './CommandPalette';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  need?: Capability;
  count?: (d: Dashboard) => number;
}

const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/', label: 'Overview', icon: <LayoutDashboard size={18} /> },
      { to: '/orders', label: 'Orders', icon: <ClipboardList size={18} />, need: 'view_ops', count: (d) => Object.values(d.live_orders).reduce((a, b) => a + b, 0) },
      { to: '/riders', label: 'Riders', icon: <Bike size={18} />, need: 'view_ops', count: (d) => d.riders.pending_review },
      { to: '/restaurants', label: 'Restaurants', icon: <Store size={18} />, need: 'view_ops' },
      { to: '/users', label: 'Customers', icon: <Users size={18} />, need: 'view_ops' },
    ],
  },
  {
    section: 'Administration',
    items: [
      { to: '/team', label: 'Team & access', icon: <ShieldCheck size={18} />, need: 'super' },
      { to: '/audit', label: 'Audit log', icon: <ScrollText size={18} />, need: 'super' },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/orders': 'Orders',
  '/riders': 'Riders',
  '/restaurants': 'Restaurants',
  '/users': 'Customers',
  '/team': 'Team & access',
  '/audit': 'Audit log',
};

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('hg.sidebar') === 'collapsed';
  } catch {
    return false;
  }
}

export function Layout() {
  const user = useUser();
  const location = useLocation();
  const { close: closePanels } = usePanels();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/admin/dashboard/live'), refetchInterval: 10_000 });

  useEffect(() => {
    try {
      localStorage.setItem('hg.sidebar', collapsed ? 'collapsed' : 'open');
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
    setMenu(false);
    closePanels();
  }, [location.pathname, closePanels]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sidebar = (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="sidebar-top">
        <Logo sub="Operations" collapsed={collapsed && !mobileOpen} />
        <button className="icon-btn-dark only-mobile" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>
      <nav className="nav">
        {NAV.map((group, gi) => {
          const items = group.items.filter((i) => !i.need || can(user, i.need));
          if (!items.length) return null;
          return (
            <div key={gi} className="nav-group">
              {group.section && <div className="nav-label">{collapsed && !mobileOpen ? '•' : group.section}</div>}
              {items.map((i) => {
                const n = data && i.count ? i.count(data) : 0;
                return (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} title={collapsed ? i.label : undefined}>
                    {i.icon}
                    <span className="nav-text">{i.label}</span>
                    {n > 0 && <span className="count">{n}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
      <button className="collapse-btn only-desktop" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        <span className="nav-text">Collapse</span>
      </button>
    </aside>
  );

  return (
    <div className={`shell${collapsed ? ' is-collapsed' : ''}`}>
      {sidebar}
      {mobileOpen && <div className="scrim nav-scrim" onClick={() => setMobileOpen(false)} />}
      <div className="workspace">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <h1 className="topbar-title">{TITLES[location.pathname] ?? 'Hungerly'}</h1>
          <button className="search-trigger" onClick={() => setPalette(true)}>
            <Search size={16} />
            <span className="search-text">Search orders, people, restaurants…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <span className="live-dot hide-sm">Live</span>
          <div className="user-menu">
            <button className="user-chip" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
              <span className="avatar sm">{initials(user?.full_name)}</span>
              <span className="user-chip-text hide-sm">
                <strong>{user?.full_name ?? 'Admin'}</strong>
                <span>{user?.admin_role ? ADMIN_ROLE[user.admin_role] : ''}</span>
              </span>
            </button>
            {menu && (
              <>
                <div className="menu-backdrop" onClick={() => setMenu(false)} />
                <div className="menu" role="menu">
                  <div className="menu-head">
                    <strong>{user?.full_name}</strong>
                    <span className="subtle">{user?.admin_role ? ADMIN_ROLE[user.admin_role] : ''} · two-factor on</span>
                  </div>
                  <button className="menu-item danger" role="menuitem" onClick={() => void signOut()}>
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
      <PanelHost />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
