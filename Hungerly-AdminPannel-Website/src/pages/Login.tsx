import { Bike, KeyRound, LayoutDashboard, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';

import { Logo, LogoMark } from '../components/Logo';
import { Button } from '../components/ui';
import { acceptSession, api, ApiError } from '../lib/api';

type Step =
  | { kind: 'password' }
  | { kind: 'verify'; token: string }
  | { kind: 'enroll'; token: string; uri: string; secret: string }
  | { kind: 'recovery'; codes: string[]; session: Parameters<typeof acceptSession>[0] };

interface LoginResponse {
  mfa_required: boolean;
  mfa_token: string;
  mfa_enrollment_required?: boolean;
  totp_uri?: string;
  totp_secret?: string;
}

export function Login() {
  const [step, setStep] = useState<Step>({ kind: 'password' });
  return (
    <div className="auth">
      <section className="auth-art">
        <Logo sub="Operations" />
        <div>
          <h1>Every order, every rider, one calm control room.</h1>
          <p>Track live orders, dispatch riders and keep the kitchen moving — with every action secured and audited.</p>
        </div>
        <div className="auth-chips">
          <span className="auth-chip">
            <LayoutDashboard size={15} /> Live operations
          </span>
          <span className="auth-chip">
            <Bike size={15} /> Rider dispatch
          </span>
          <span className="auth-chip">
            <ShieldCheck size={15} /> Two-factor secured
          </span>
        </div>
      </section>
      <section className="auth-panel">
        {step.kind === 'password' && <PasswordStep onNext={setStep} />}
        {step.kind === 'verify' && <CodeStep token={step.token} onBack={() => setStep({ kind: 'password' })} />}
        {step.kind === 'enroll' && <EnrollStep step={step} onDone={(codes, session) => setStep({ kind: 'recovery', codes, session })} />}
        {step.kind === 'recovery' && <RecoveryStep codes={step.codes} onContinue={() => acceptSession(step.session)} />}
      </section>
    </div>
  );
}

function PasswordStep({ onNext }: { onNext: (s: Step) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false });
      setPassword('');
      if (res.mfa_enrollment_required && res.totp_uri && res.totp_secret) {
        onNext({ kind: 'enroll', token: res.mfa_token, uri: res.totp_uri, secret: res.totp_secret });
      } else {
        onNext({ kind: 'verify', token: res.mfa_token });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <LogoMark size={52} />
      <div>
        <h2>Sign in</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Use your Hungerly admin account.
        </p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field">
        <label htmlFor="email">Work email</label>
        <input id="email" className="input lg" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          className="input lg"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button size="lg" block loading={busy} type="submit">
        Continue
      </Button>
      <p className="subtle" style={{ textAlign: 'center' }}>
        Protected by two-factor authentication. Repeated failed attempts lock the account.
      </p>
    </form>
  );
}

function CodeStep({ token, onBack }: { token: string; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = useRecovery ? { mfa_token: token, recovery_code: code.trim() } : { mfa_token: token, code };
      acceptSession(await api('/auth/mfa/verify', { method: 'POST', body, auth: false }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      // The sign-in token is single-use: a failed code means starting again.
      if (err instanceof ApiError && err.status !== 422) window.setTimeout(onBack, 1600);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="row" style={{ gap: 12 }}>
        <div className="stat-icon tone-primary">
          <KeyRound size={18} />
        </div>
        <div>
          <h2>Two-factor check</h2>
          <p className="muted">{useRecovery ? 'Enter one of your recovery codes.' : 'Enter the 6-digit code from your authenticator app.'}</p>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {useRecovery ? (
        <input className="input lg" autoFocus required maxLength={32} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Recovery code" />
      ) : (
        <input
          className="input lg otp-input"
          autoFocus
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="••••••"
        />
      )}
      <Button size="lg" block loading={busy} type="submit" disabled={!useRecovery && code.length !== 6}>
        Verify and sign in
      </Button>
      <div className="row between">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setUseRecovery(!useRecovery);
            setCode('');
          }}
        >
          {useRecovery ? 'Use authenticator code' : 'Use a recovery code'}
        </button>
      </div>
    </form>
  );
}

function EnrollStep({
  step,
  onDone,
}: {
  step: Extract<Step, { kind: 'enroll' }>;
  onDone: (codes: string[], session: Parameters<typeof acceptSession>[0]) => void;
}) {
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Rendered locally: the TOTP secret never leaves the browser for a third-party QR service.
    void QRCode.toDataURL(step.uri, { margin: 0, width: 368, color: { dark: '#1F332C', light: '#FFFFFF' } }).then(setQr);
  }, [step.uri]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<Parameters<typeof acceptSession>[0] & { recovery_codes: string[] }>('/auth/mfa/confirm', {
        method: 'POST',
        body: { mfa_token: step.token, code },
        auth: false,
      });
      onDone(res.recovery_codes, res);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.message} You'll need to sign in again.` : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div>
        <h2>Set up two-factor</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Scan this with Google Authenticator, Microsoft Authenticator or 1Password, then enter the code it shows.
        </p>
      </div>
      <div className="qr">{qr ? <img src={qr} width={184} height={184} alt="Authenticator QR code" /> : <div style={{ width: 184, height: 184 }} />}</div>
      <div className="secret">{step.secret.match(/.{1,4}/g)?.join(' ')}</div>
      {error && <div className="alert alert-error">{error}</div>}
      <input
        className="input lg otp-input"
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        placeholder="••••••"
      />
      <Button size="lg" block loading={busy} type="submit" disabled={code.length !== 6}>
        Turn on two-factor
      </Button>
    </form>
  );
}

function RecoveryStep({ codes, onContinue }: { codes: string[]; onContinue: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="auth-card">
      <div>
        <h2>Save your recovery codes</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Each code works once if you lose your phone. They won't be shown again — store them in a password manager.
        </p>
      </div>
      <div className="codes">
        {codes.map((c) => (
          <code key={c}>{c}</code>
        ))}
      </div>
      <Button variant="ghost" block onClick={() => void navigator.clipboard.writeText(codes.join('\n')).then(() => setSaved(true))}>
        {saved ? 'Copied' : 'Copy codes'}
      </Button>
      <label className="row" style={{ fontSize: 13, fontWeight: 600 }}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I've stored these codes safely
      </label>
      <Button size="lg" block disabled={!saved} onClick={onContinue}>
        Go to dashboard
      </Button>
    </div>
  );
}
