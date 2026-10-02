import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * One place that owns the slide-over detail panels. Any page (or another panel) can open an order,
 * customer, rider or restaurant; panels opened from inside a panel stack, with a Back button.
 */
export type PanelRef =
  | { kind: 'order'; id: string }
  | { kind: 'customer'; id: string }
  | { kind: 'rider'; id: string }
  | { kind: 'restaurant'; id: string };

interface PanelApi {
  stack: PanelRef[];
  open: (p: PanelRef, opts?: { replace?: boolean }) => void;
  back: () => void;
  close: () => void;
}

const Ctx = createContext<PanelApi | null>(null);

export function PanelProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<PanelRef[]>([]);
  const open = useCallback((p: PanelRef, opts?: { replace?: boolean }) => {
    setStack((s) => {
      const top = s.at(-1);
      if (top && top.kind === p.kind && top.id === p.id) return s;
      if (opts?.replace || s.length >= 6) return [...s.slice(0, -1), p];
      return [...s, p];
    });
  }, []);
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const close = useCallback(() => setStack([]), []);
  const value = useMemo(() => ({ stack, open, back, close }), [stack, open, back, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePanels(): PanelApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePanels outside PanelProvider');
  return v;
}

/** Root-level open: replaces whatever is showing (used by table rows). */
export function useOpenPanel() {
  const { open, stack } = usePanels();
  return useCallback((p: PanelRef) => open(p, { replace: stack.length > 0 }), [open, stack.length]);
}
