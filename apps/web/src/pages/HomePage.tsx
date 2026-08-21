import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '@engarde/backend/convex/_generated/api';
import { Link } from '@tanstack/react-router';
import { AuthLoading, Authenticated, Unauthenticated, useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { convexUrl } from '../backend';

// Landing page for the substrate bootstrap: proves the frontend renders and
// reports whether a backend deployment is wired up. Replaced as real surfaces land.
export function HomePage({
  backendConfigured = Boolean(convexUrl),
}: { backendConfigured?: boolean }) {
  if (backendConfigured) return <AuthSurface />;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6">
      <h1 className="text-6xl">En Garde</h1>
      <p className="text-center text-text-dim">
        A table for Draw Steel. Greenfield substrate — surfaces arrive as their backing lands.
      </p>
      <section className="w-full border border-line bg-ink-1 p-6">
        <h2 className="mb-4 type-label text-xs text-text-mute">Substrate status</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-text-dim">Frontend</dt>
          <dd>rendering</dd>
          <dt className="text-text-dim">Backend</dt>
          <dd>
            {backendConfigured ? <LiveInstanceName /> : 'not configured — run `pnpm dev:backend`'}
          </dd>
        </dl>
      </section>
    </main>
  );
}

function AuthSurface() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-12">
      <header>
        <h1 className="text-6xl">En Garde</h1>
        <p className="mt-3 text-text-dim">Gather your company around the table.</p>
      </header>
      <AuthLoading>
        <p className="text-text-dim">Restoring your session…</p>
      </AuthLoading>
      <Unauthenticated>
        <PasswordForm />
      </Unauthenticated>
      <Authenticated>
        <Account />
      </Authenticated>
    </main>
  );
}

type AuthFlow = 'signIn' | 'signUp' | 'verify' | 'forgot' | 'reset';

function PasswordForm() {
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
        setMessage(
          'Check your email for the verification code. In local development, check the backend console.',
        );
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
          ? 'Create your account'
          : flow === 'forgot' || flow === 'reset'
            ? 'Reset your password'
            : flow === 'verify'
              ? 'Verify your email'
              : 'Sign in'}
      </h2>
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <label className="grid gap-2 text-sm text-text-dim">
          Email
          <input
            className="border border-line bg-ink-0 px-3 py-2 text-base"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>
        {needsPassword && (
          <label className="grid gap-2 text-sm text-text-dim">
            Password
            <input
              className="border border-line bg-ink-0 px-3 py-2 text-base"
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete={flow === 'signUp' ? 'new-password' : 'current-password'}
            />
            <span className="text-xs text-text-mute">
              12+ characters with uppercase, lowercase, and a number.
            </span>
          </label>
        )}
        {needsCode && (
          <label className="grid gap-2 text-sm text-text-dim">
            Code
            <input
              className="border border-line bg-ink-0 px-3 py-2 font-mono text-base"
              name="code"
              required
              autoComplete="one-time-code"
            />
          </label>
        )}
        {flow === 'reset' && (
          <label className="grid gap-2 text-sm text-text-dim">
            New password
            <input
              className="border border-line bg-ink-0 px-3 py-2 text-base"
              name="newPassword"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </label>
        )}
        <button
          className="h-11 bg-accent px-4 font-semibold text-ink-0 hover:bg-accent-strong disabled:opacity-50"
          disabled={busy}
          type="submit"
        >
          {busy
            ? 'Working…'
            : flow === 'forgot'
              ? 'Send reset code'
              : flow === 'verify'
                ? 'Verify and sign in'
                : flow === 'reset'
                  ? 'Set new password'
                  : flow === 'signUp'
                    ? 'Create account'
                    : 'Sign in'}
        </button>
      </form>
      {message && <output className="mt-4 block text-sm text-text-dim">{message}</output>}
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-accent">
        {flow !== 'signIn' && (
          <button type="button" onClick={() => setFlow('signIn')}>
            Sign in
          </button>
        )}
        {flow !== 'signUp' && (
          <button type="button" onClick={() => setFlow('signUp')}>
            Create account
          </button>
        )}
        {flow !== 'forgot' && (
          <button type="button" onClick={() => setFlow('forgot')}>
            Forgot password?
          </button>
        )}
      </div>
    </section>
  );
}

function Account() {
  const profile = useQuery(api.profiles.current);
  if (profile === undefined) return <p className="text-text-dim">Loading your account…</p>;
  if (profile === null) return <ProfileForm mode="onboarding" />;
  return (
    <>
      <nav className="grid gap-3 sm:grid-cols-2">
        <Link to="/campaigns" className="group block">
          <div className="h-full border border-line bg-ink-1 p-5 transition-colors group-hover:border-accent">
            <h2 className="text-2xl">Your campaigns</h2>
            <p className="mt-1 text-sm text-text-dim">
              Open a table you're part of, create one, or join with a code.
            </p>
          </div>
        </Link>
        <Link to="/directory" className="group block">
          <div className="h-full border border-line bg-ink-1 p-5 transition-colors group-hover:border-accent">
            <h2 className="text-2xl">Campaign directory</h2>
            <p className="mt-1 text-sm text-text-dim">
              Browse public campaigns looking for players.
            </p>
          </div>
        </Link>
      </nav>
      <ProfileForm mode="edit" profile={profile} />
    </>
  );
}

function ProfileForm({
  mode,
  profile,
}: {
  mode: 'onboarding' | 'edit';
  profile?: { displayName: string; handle: string; role: 'member' | 'admin' };
}) {
  const save = useMutation(
    mode === 'onboarding' ? api.profiles.completeOnboarding : api.profiles.update,
  );
  const { signOut } = useAuthActions();
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await save({
        displayName: String(values.get('displayName')),
        handle: String(values.get('handle')),
      });
      setMessage('Profile saved.');
    } catch (error) {
      setMessage(actionableError(error, 'Profile could not be saved.'));
    }
  }
  return (
    <section className="border border-line bg-ink-1 p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl">
          {mode === 'onboarding' ? 'Choose your table name' : 'Your account'}
        </h2>
        <button className="text-sm text-accent" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      {profile?.role === 'admin' && (
        <p className="mt-2 type-label text-xs text-accent">Instance administrator</p>
      )}
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <label className="grid gap-2 text-sm text-text-dim">
          Display name
          <input
            className="border border-line bg-ink-0 px-3 py-2 text-base"
            name="displayName"
            defaultValue={profile?.displayName}
            maxLength={60}
            required
          />
        </label>
        <label className="grid gap-2 text-sm text-text-dim">
          Handle
          <input
            className="border border-line bg-ink-0 px-3 py-2 text-base"
            name="handle"
            defaultValue={profile?.handle}
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]+"
            required
          />
          <span className="text-xs text-text-mute">
            3–24 letters, numbers, or underscores. Used for exact friend discovery.
          </span>
        </label>
        <button
          className="h-11 bg-accent px-4 font-semibold text-ink-0 hover:bg-accent-strong"
          type="submit"
        >
          {mode === 'onboarding' ? 'Enter En Garde' : 'Save profile'}
        </button>
      </form>
      {message && <output className="mt-4 block text-sm text-text-dim">{message}</output>}
    </section>
  );
}

function actionableError(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof error.data === 'string'
  ) {
    return error.data;
  }
  return fallback;
}

// Only mounted when a deployment URL exists (ConvexProvider is present).
function LiveInstanceName() {
  const name = useQuery(api.instance.getName);
  return <span>{name === undefined ? 'connecting…' : `connected — instance "${name}"`}</span>;
}
