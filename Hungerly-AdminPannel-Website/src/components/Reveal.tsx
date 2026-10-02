import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api, ApiError } from '../lib/api';
import { useToast } from './ui';

const AUTO_HIDE_MS = 30_000;

/**
 * Shows a masked value with an eye button. Revealing calls the audited server endpoint (never cached in the
 * browser), re-masks itself after 30 s, and offers copy. The server decides who may reveal.
 */
export function useReveal<T>(path: string) {
  const toast = useToast();
  const [data, setData] = useState<T | null>(null);
  const m = useMutation({
    mutationFn: () => api<T>(path, { method: 'POST' }),
    onSuccess: (d) => setData(d),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not reveal', 'error'),
  });
  useEffect(() => {
    if (!data) return;
    const t = window.setTimeout(() => setData(null), AUTO_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [data]);
  useEffect(() => setData(null), [path]);
  return {
    data,
    busy: m.isPending,
    reveal: () => m.mutate(),
    hide: () => setData(null),
  };
}

export function RevealValue({
  masked,
  value,
  revealed,
  busy,
  onReveal,
  onHide,
  canReveal = true,
  mono = true,
}: {
  masked: string | null | undefined;
  value: string | null | undefined;
  revealed: boolean;
  busy: boolean;
  onReveal: () => void;
  onHide: () => void;
  canReveal?: boolean;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!masked && !value) return <span className="subtle">Not provided</span>;
  const shown = revealed ? value ?? '—' : masked;
  return (
    <span className={`reveal${revealed ? ' on' : ''}`}>
      <span className={mono ? 'mono reveal-text' : 'reveal-text'}>{shown}</span>
      {canReveal && (
        <button
          type="button"
          className="reveal-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (revealed) onHide();
            else onReveal();
          }}
          aria-label={revealed ? 'Hide' : 'Show full value'}
          title={revealed ? 'Hide' : 'Show full value (logged in audit)'}
          disabled={busy}
        >
          {busy ? <span className="spinner" style={{ width: 12, height: 12 }} /> : revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
      {revealed && value && (
        <button
          type="button"
          className="reveal-btn"
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
          aria-label="Copy"
          title="Copy"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
    </span>
  );
}
