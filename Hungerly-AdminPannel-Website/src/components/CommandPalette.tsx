import { useQuery } from '@tanstack/react-query';
import { Bike, ClipboardList, CornerDownLeft, LayoutDashboard, ScrollText, Search, ShieldCheck, Store, User, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';

import { api } from '../lib/api';
import { ORDER_STATUS, rupees, titleCase } from '../lib/format';
import { useOpenPanel } from '../lib/panels';
import { can, useUser } from '../lib/session';
import type { SearchResults } from '../lib/types';

interface Item {
  key: string;
  group: string;
  icon: ReactNode;
  title: string;
  sub?: string;
  run: () => void;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Ctrl/⌘+K: jump to any page, order, customer, rider or restaurant. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const openPanel = useOpenPanel();
  const user = useUser();
  const term = useDebounced(q.trim(), 200);

  const { data, isFetching } = useQuery({
    queryKey: ['search', term],
    queryFn: () => api<SearchResults>('/admin/search', { query: { q: term } }),
    enabled: open && term.length >= 2 && can(user, 'view_ops'),
    staleTime: 10_000,
  });

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      window.setTimeout(() => input.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => navigate(path);
    const pages: Item[] = [
      { key: 'p-dash', group: 'Pages', icon: <LayoutDashboard size={16} />, title: 'Overview', run: go('/') },
      ...(can(user, 'view_ops')
        ? [
            { key: 'p-orders', group: 'Pages', icon: <ClipboardList size={16} />, title: 'Orders', sub: 'Live orders', run: go('/orders') },
            { key: 'p-riders', group: 'Pages', icon: <Bike size={16} />, title: 'Riders', run: go('/riders') },
            { key: 'p-pending', group: 'Pages', icon: <Bike size={16} />, title: 'Rider applications', sub: 'Pending review', run: go('/riders?status=pending_review') },
            { key: 'p-rest', group: 'Pages', icon: <Store size={16} />, title: 'Restaurants', run: go('/restaurants') },
            { key: 'p-users', group: 'Pages', icon: <Users size={16} />, title: 'Customers', run: go('/users') },
          ]
        : []),
      ...(can(user, 'super')
        ? [
            { key: 'p-team', group: 'Pages', icon: <ShieldCheck size={16} />, title: 'Team & access', run: go('/team') },
            { key: 'p-audit', group: 'Pages', icon: <ScrollText size={16} />, title: 'Audit log', run: go('/audit') },
          ]
        : []),
    ];
    const t = q.trim().toLowerCase();
    const matchedPages = t ? pages.filter((p) => p.title.toLowerCase().includes(t) || p.sub?.toLowerCase().includes(t)) : pages;
    if (!data || term.length < 2) return matchedPages;
    return [
      ...data.orders.map((o) => ({
        key: `o-${o.id}`, group: 'Orders', icon: <ClipboardList size={16} />, title: o.order_number,
        sub: `${ORDER_STATUS[o.status].label} · ${rupees(o.total)}`, run: () => openPanel({ kind: 'order', id: o.id }),
      })),
      ...data.people.map((p) => ({
        key: `u-${p.id}`, group: 'People', icon: p.delivery_partner_id ? <Bike size={16} /> : <User size={16} />, title: p.name ?? 'No name',
        sub: `${p.roles.map(titleCase).join(', ')} · ${p.masked_phone ?? ''}`,
        run: () => openPanel(p.delivery_partner_id ? { kind: 'rider', id: p.delivery_partner_id } : { kind: 'customer', id: p.id }),
      })),
      ...data.restaurants.map((r) => ({
        key: `r-${r.id}`, group: 'Restaurants', icon: <Store size={16} />, title: r.name, sub: `${r.locality} · ${titleCase(r.status)}`,
        run: () => openPanel({ kind: 'restaurant', id: r.id }),
      })),
      ...matchedPages,
    ];
  }, [data, term, q, user, navigate, openPanel]);

  useEffect(() => setActive(0), [items.length]);

  if (!open) return null;
  const choose = (i: Item | undefined) => {
    if (!i) return;
    onClose();
    i.run();
  };
  let lastGroup = '';

  return createPortal(
    <>
      <div className="scrim modal-scrim" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette-input">
          <Search size={18} />
          <input
            ref={input}
            value={q}
            placeholder="Search orders, people, phone numbers, restaurants…"
            maxLength={60}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === 'Enter') choose(items[active]);
              if (e.key === 'Escape') onClose();
            }}
          />
          {isFetching && <span className="spinner" />}
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list">
          {items.length === 0 && <div className="palette-empty">No matches. Try an order number like HGR-…, a name or a full 10-digit phone.</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {header && <div className="palette-group">{header}</div>}
                <button className={`palette-item${i === active ? ' active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => choose(it)}>
                  <span className="palette-icon">{it.icon}</span>
                  <span className="palette-text">
                    <strong>{it.title}</strong>
                    {it.sub && <span>{it.sub}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="palette-enter" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>Phone search needs all 10 digits (numbers are encrypted)</span>
        </div>
      </div>
    </>,
    document.body,
  );
}
