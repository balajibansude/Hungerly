import { ArrowLeft, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { ORDER_STATUS, PARTNER_STATUS, titleCase } from '../lib/format';

// --- Button ----------------------------------------------------------------------------

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, block, icon, children, disabled, className = '', ...rest }: ButtonProps) {
  const cls = ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

// --- Badges -----------------------------------------------------------------------------

export function Badge({ tone, children, plain }: { tone: string; children: ReactNode; plain?: boolean }) {
  return <span className={`badge ${tone}${plain ? ' plain' : ''}`}>{children}</span>;
}

export function OrderBadge({ status }: { status: keyof typeof ORDER_STATUS }) {
  const s = ORDER_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PartnerBadge({ status }: { status: string }) {
  const s = PARTNER_STATUS[status] ?? { label: titleCase(status), tone: 'tone-neutral' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function FoodMark({ type }: { type: 'veg' | 'non_veg' | 'egg' }) {
  const color = { veg: 'var(--veg)', non_veg: 'var(--non-veg)', egg: 'var(--egg)' }[type];
  return <span className="food-mark" style={{ color }} aria-label={titleCase(type)} />;
}

// --- States ------------------------------------------------------------------------------

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      {children && <span>{children}</span>}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} style={{ cursor: 'default' }}>
          {Array.from({ length: cols }, (_, j) => (
            <td key={j}>
              <Skeleton h={14} w={j === 0 ? '70%' : '55%'} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : 'Something went wrong.';
  return <div className="alert alert-error">{msg}</div>;
}

// --- Tabs ----------------------------------------------------------------------------------

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          className={`tab${value === it.value ? ' active' : ''}`}
          onClick={() => onChange(it.value)}
        >
          {it.label}
          {!!it.count && <span className="pill">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch${on ? ' on' : ''}`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
    />
  );
}

// --- Overlays ------------------------------------------------------------------------------

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

export function Drawer({
  onClose,
  onBack,
  header,
  footer,
  children,
  wide,
}: {
  onClose: () => void;
  onBack?: () => void;
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEscape(onBack ?? onClose);
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <aside className={`drawer${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="drawer-head">
          {onBack && (
            <button className="icon-btn" onClick={onBack} aria-label="Back" title="Back">
              <ArrowLeft size={18} />
            </button>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>{header}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>,
    document.body,
  );
}

export function Modal({ onClose, title, children, actions }: { onClose: () => void; title: string; children: ReactNode; actions?: ReactNode }) {
  useEscape(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
  }, []);
  return createPortal(
    <>
      <div className="scrim modal-scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        <div className="stack" style={{ marginTop: 16 }}>
          {children}
        </div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </>,
    document.body,
  );
}

// --- Toasts ----------------------------------------------------------------------------------

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast${t.kind === 'error' ? ' error' : ''}`}>
              {t.text}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
