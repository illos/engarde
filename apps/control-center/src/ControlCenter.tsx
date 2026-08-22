import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '@engarde/backend/convex/_generated/api';
import { Link } from '@tanstack/react-router';
import { AuthLoading, Authenticated, Unauthenticated, useMutation, useQuery } from 'convex/react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Button } from './Button';

type AuthFlow = 'signIn' | 'signUp' | 'verify' | 'forgot' | 'reset';

function errorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof error.data === 'string'
  )
    return error.data;
  return fallback;
}

export function AuthPanel() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<AuthFlow>('signIn');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const values = new FormData(event.currentTarget);
    const providerFlow =
      flow === 'verify'
        ? 'email-verification'
        : flow === 'forgot'
          ? 'reset'
          : flow === 'reset'
            ? 'reset-verification'
            : flow;
    const params: Record<string, string> = {
      flow: providerFlow,
      email: email.trim().toLowerCase(),
    };
    for (const key of ['password', 'code', 'newPassword']) {
      const value = values.get(key);
      if (typeof value === 'string') params[key] = value;
    }
    try {
      await signIn('password', params);
      if (flow === 'signUp') {
        setFlow('verify');
        setMessage('Check your email for the verification code.');
      } else if (flow === 'forgot') {
        setFlow('reset');
        setMessage('If the address is registered, a reset code has been sent.');
      }
    } catch {
      if (flow === 'forgot') setFlow('reset');
      setMessage(
        flow === 'forgot'
          ? 'If the address is registered, a reset code has been sent.'
          : 'That request could not be completed. Check the details and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const needsPassword = flow === 'signIn' || flow === 'signUp';
  const needsCode = flow === 'verify' || flow === 'reset';
  return (
    <section className="border border-line bg-ink-1 p-6">
      <h2 className="text-2xl">
        {flow === 'signUp'
          ? 'Create an identity'
          : flow === 'verify'
            ? 'Verify your email'
            : flow === 'forgot' || flow === 'reset'
              ? 'Reset your password'
              : 'Operator sign in'}
      </h2>
      <p className="mt-2 text-sm text-text-dim">
        Authentication proves identity. Control-center access is granted separately.
      </p>
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <label className="grid gap-2 text-sm text-text-dim">
          Email
          <input
            className="h-11 border border-line bg-ink-0 px-3 text-base text-text"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>
        {needsPassword ? (
          <label className="grid gap-2 text-sm text-text-dim">
            Password
            <input
              className="h-11 border border-line bg-ink-0 px-3 text-base text-text"
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete={flow === 'signUp' ? 'new-password' : 'current-password'}
            />
          </label>
        ) : null}
        {needsCode ? (
          <label className="grid gap-2 text-sm text-text-dim">
            Verification code
            <input
              className="h-11 border border-line bg-ink-0 px-3 font-mono text-base text-text"
              name="code"
              required
              autoComplete="one-time-code"
            />
          </label>
        ) : null}
        {flow === 'reset' ? (
          <label className="grid gap-2 text-sm text-text-dim">
            New password
            <input
              className="h-11 border border-line bg-ink-0 px-3 text-base text-text"
              name="newPassword"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </label>
        ) : null}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy
            ? 'Working…'
            : flow === 'signUp'
              ? 'Create identity'
              : flow === 'verify'
                ? 'Verify and sign in'
                : flow === 'forgot'
                  ? 'Send reset code'
                  : flow === 'reset'
                    ? 'Set new password'
                    : 'Sign in'}
        </Button>
      </form>
      {message ? <output className="mt-4 block text-sm text-text-dim">{message}</output> : null}
      <div className="mt-5 flex flex-wrap gap-4 text-sm text-accent">
        {flow !== 'signIn' ? (
          <button
            className="inline-flex min-h-11 items-center"
            type="button"
            onClick={() => setFlow('signIn')}
          >
            Sign in
          </button>
        ) : null}
        {flow !== 'signUp' ? (
          <button
            className="inline-flex min-h-11 items-center"
            type="button"
            onClick={() => setFlow('signUp')}
          >
            Create identity
          </button>
        ) : null}
        {flow !== 'forgot' ? (
          <button
            className="inline-flex min-h-11 items-center"
            type="button"
            onClick={() => setFlow('forgot')}
          >
            Forgot password?
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SignOutButton() {
  const { signOut } = useAuthActions();
  return (
    <Button onClick={() => void signOut()} className="shrink-0">
      Sign out
    </Button>
  );
}

function SetupPanel() {
  const bootstrap = useMutation(api.operators.bootstrap);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    bootstrap({
      instanceName: String(values.get('instanceName')),
      capability: String(values.get('capability')),
    })
      .catch((error) => setMessage(errorMessage(error, 'Setup could not be completed.')))
      .finally(() => setBusy(false));
  };
  return (
    <section className="border border-accent/50 bg-ink-1 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="type-label text-xs text-accent">Installation setup</p>
          <h2 className="mt-2 text-3xl">Establish the first Operator</h2>
        </div>
        <SignOutButton />
      </div>
      <p className="mt-3 max-w-2xl text-text-dim">
        This one-time transaction names the instance, grants your verified identity Operator access,
        and permanently seals setup.
      </p>
      <form className="mt-6 grid max-w-xl gap-4" onSubmit={submit}>
        <label className="grid gap-2 text-sm text-text-dim">
          Instance name
          <input
            name="instanceName"
            className="h-11 border border-line bg-ink-0 px-3 text-base text-text"
            defaultValue="En Garde"
            maxLength={80}
            required
          />
        </label>
        <label className="grid gap-2 text-sm text-text-dim">
          One-time setup capability
          <input
            name="capability"
            className="h-11 border border-line bg-ink-0 px-3 font-mono text-base text-text"
            type="password"
            autoComplete="off"
            required
          />
        </label>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Sealing setup…' : 'Complete installation setup'}
        </Button>
      </form>
      {message ? <p className="mt-3 text-sm text-foe">{message}</p> : null}
    </section>
  );
}

function AccessDenied() {
  return (
    <section className="border border-foe/50 bg-ink-1 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="type-label text-xs text-foe">Access denied</p>
          <h2 className="mt-2 text-3xl">Operator entitlement required</h2>
          <p className="mt-3 text-text-dim">
            This identity is authenticated but is not an active installation Operator.
          </p>
        </div>
        <SignOutButton />
      </div>
    </section>
  );
}

function OperatorGate({ children }: { children: ReactNode }) {
  const isOperator = useQuery(api.operators.current, {});
  if (isOperator === undefined) return <p className="text-text-dim">Checking authority…</p>;
  if (!isOperator) return <AccessDenied />;
  return children;
}

function OperatorDashboard() {
  const instanceName = useQuery(api.instance.getName, {});
  const operators = useQuery(api.operators.list, {});
  const setName = useMutation(api.instance.setName);
  const grant = useMutation(api.operators.grantByEmail);
  const revoke = useMutation(api.operators.revoke);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (instanceName === undefined || operators === undefined)
    return <p className="text-text-dim">Loading control center…</p>;

  const run = (action: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    action()
      .then(() => setMessage(success))
      .catch((error) => setMessage(errorMessage(error, 'The operation could not be completed.')))
      .finally(() => setBusy(false));
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
      <section className="border border-line bg-ink-1 p-6">
        <p className="type-label text-xs text-text-mute">Installation identity</p>
        <h2 className="mt-2 text-3xl">{instanceName}</h2>
        <form
          className="mt-6 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            run(() => setName({ name: String(values.get('name')) }), 'Instance name updated.');
          }}
        >
          <input
            name="name"
            aria-label="Instance name"
            defaultValue={instanceName}
            maxLength={80}
            required
            className="h-11 min-w-0 flex-1 border border-line bg-ink-0 px-3 text-base text-text"
          />
          <Button type="submit" disabled={busy}>
            Save name
          </Button>
        </form>
      </section>

      <section className="border border-line bg-ink-1 p-6 lg:row-span-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="type-label text-xs text-text-mute">Current authority</p>
            <h2 className="mt-2 text-3xl">Operators</h2>
          </div>
          <SignOutButton />
        </div>
        <ul className="mt-6 grid gap-3">
          {operators.map((operator) => (
            <li key={operator.userId} className="border border-line-soft bg-ink-2 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{operator.email}</p>
                  <p className="mt-1 text-xs text-text-mute">
                    {operator.source === 'provisioned' ? 'Setup Operator' : 'Delegated Operator'} ·{' '}
                    {new Date(operator.grantedAt).toLocaleDateString()}
                  </p>
                </div>
                {operator.isCurrent ? (
                  <span className="type-label border border-accent/40 px-2 py-1 text-[0.65rem] text-accent">
                    You
                  </span>
                ) : null}
                <Button
                  variant="danger"
                  disabled={busy || operators.length === 1}
                  onClick={() => {
                    if (window.confirm(`Revoke Operator access for ${operator.email}?`))
                      run(
                        () => revoke({ targetUserId: operator.userId }),
                        'Operator access revoked.',
                      );
                  }}
                >
                  Revoke
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <form
          className="mt-6 grid gap-3 border-t border-line-soft pt-6"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const values = new FormData(form);
            run(() => grant({ email: String(values.get('email')) }), 'Operator access granted.');
            form.reset();
          }}
        >
          <label className="grid gap-2 text-sm text-text-dim">
            Grant a verified identity
            <input
              name="email"
              aria-label="New Operator email"
              type="email"
              required
              className="h-11 border border-line bg-ink-0 px-3 text-base text-text"
              placeholder="operator@example.com"
            />
          </label>
          <Button type="submit" variant="primary" disabled={busy}>
            Grant Operator access
          </Button>
        </form>
      </section>

      <section className="border border-line bg-ink-1 p-6">
        <p className="type-label text-xs text-text-mute">Boundary</p>
        <h2 className="mt-2 text-2xl">Installation authority only</h2>
        <p className="mt-3 text-text-dim">
          Operator status grants no campaign membership, character access, or Director powers.
        </p>
        <Link to="/audit" className="mt-5 inline-block text-accent underline underline-offset-4">
          Open the audit trail
        </Link>
      </section>
      {message ? <output className="text-sm text-text-dim lg:col-span-2">{message}</output> : null}
    </div>
  );
}

export function SystemControlCenterPage() {
  const setupStatus = useQuery(api.operators.setupStatus, {});
  if (setupStatus === undefined) return <p className="text-text-dim">Checking installation…</p>;
  if (setupStatus === 'setup_pending')
    return (
      <section className="border border-accent/50 bg-ink-1 p-6">
        <p className="type-label text-xs text-accent">Installation setup</p>
        <h2 className="mt-2 text-3xl">This control center has not been established</h2>
        <p className="mt-3 max-w-2xl text-text-dim">
          A verified identity and the one-time deployment capability are required to establish the
          first Operator.
        </p>
        <Link
          to="/setup"
          className="mt-6 inline-block border border-accent bg-accent px-4 py-2 font-mono text-sm font-semibold uppercase tracking-wider text-ink-0"
        >
          Open sealed setup
        </Link>
      </section>
    );
  return (
    <>
      <AuthLoading>
        <p className="text-text-dim">Restoring the control session…</p>
      </AuthLoading>
      <Unauthenticated>
        <AuthPanel />
      </Unauthenticated>
      <Authenticated>
        <OperatorGate>
          <OperatorDashboard />
        </OperatorGate>
      </Authenticated>
    </>
  );
}

export function SystemControlCenterSetupPage() {
  const setupStatus = useQuery(api.operators.setupStatus, {});
  if (setupStatus === undefined) return <p className="text-text-dim">Checking installation…</p>;
  if (setupStatus === 'setup_complete')
    return (
      <section className="border border-line bg-ink-1 p-6">
        <p className="type-label text-xs text-text-mute">Setup sealed</p>
        <h2 className="mt-2 text-3xl">Installation setup is complete</h2>
        <p className="mt-3 text-text-dim">
          The one-time setup route can no longer grant installation authority.
        </p>
        <Link to="/" className="mt-5 inline-block text-accent underline underline-offset-4">
          Return to the control center
        </Link>
      </section>
    );
  return (
    <>
      <AuthLoading>
        <p className="text-text-dim">Restoring the setup session…</p>
      </AuthLoading>
      <Unauthenticated>
        <AuthPanel />
      </Unauthenticated>
      <Authenticated>
        <SetupPanel />
      </Authenticated>
    </>
  );
}

const auditLabels = {
  installation_bootstrapped: 'Installation setup completed',
  operator_granted: 'Operator access granted',
  operator_revoked: 'Operator access revoked',
  instance_name_set: 'Instance name changed',
} as const;

function AuditTrail() {
  const events = useQuery(api.operators.listAudit, {});
  if (events === undefined) return <p className="text-text-dim">Loading audit trail…</p>;
  return (
    <section className="border border-line bg-ink-1 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="type-label text-xs text-text-mute">Append-only history</p>
          <h2 className="mt-2 text-3xl">Operator audit trail</h2>
        </div>
        <SignOutButton />
      </div>
      {events.length === 0 ? (
        <p className="mt-6 text-text-dim">No control-center events have been recorded.</p>
      ) : (
        <ol className="mt-6 grid gap-3">
          {events.map((event) => (
            <li key={event.eventId} className="border border-line-soft bg-ink-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-lg">{auditLabels[event.type]}</p>
                <time className="font-mono text-xs text-text-mute">
                  {new Date(event.occurredAt).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-sm text-text-dim">
                Actor: <span className="font-mono">{event.actorEmail}</span>
                {event.subjectEmail ? (
                  <>
                    {' '}
                    · Subject: <span className="font-mono">{event.subjectEmail}</span>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function SystemControlCenterAuditPage() {
  const setupStatus = useQuery(api.operators.setupStatus, {});
  if (setupStatus === undefined) return <p className="text-text-dim">Checking installation…</p>;
  if (setupStatus === 'setup_pending')
    return (
      <section className="border border-line bg-ink-1 p-6">
        <h2 className="text-3xl">Setup required</h2>
        <Link to="/setup" className="mt-4 inline-block text-accent underline underline-offset-4">
          Return to installation setup
        </Link>
      </section>
    );
  return (
    <>
      <AuthLoading>
        <p className="text-text-dim">Restoring the control session…</p>
      </AuthLoading>
      <Unauthenticated>
        <AuthPanel />
      </Unauthenticated>
      <Authenticated>
        <OperatorGate>
          <AuditTrail />
        </OperatorGate>
      </Authenticated>
    </>
  );
}
