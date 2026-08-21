import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '@engarde/backend/convex/_generated/api';
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
      <h1 className="font-serif text-6xl tracking-tight">En Garde</h1>
      <p className="text-center text-stone-400">
        A table for Draw Steel. Greenfield substrate — surfaces arrive as their backing lands.
      </p>
      <section className="w-full rounded-lg border border-stone-800 bg-stone-900 p-6">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-stone-500">
          Substrate status
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-stone-400">Frontend</dt>
          <dd>rendering</dd>
          <dt className="text-stone-400">Backend</dt>
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
        <h1 className="font-serif text-6xl tracking-tight">En Garde</h1>
        <p className="mt-3 text-stone-400">Gather your company around the table.</p>
      </header>
      <AuthLoading>
        <p className="text-stone-400">Restoring your session…</p>
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
    <section className="rounded-xl border border-stone-800 bg-stone-900 p-6">
      <h2 className="font-serif text-2xl">
        {flow === 'signUp'
          ? 'Create your account'
          : flow === 'forgot' || flow === 'reset'
            ? 'Reset your password'
            : flow === 'verify'
              ? 'Verify your email'
              : 'Sign in'}
      </h2>
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <label className="grid gap-2 text-sm text-stone-300">
          Email
          <input
            className="rounded-md border border-stone-700 bg-stone-950 px-3 py-2"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>
        {needsPassword && (
          <label className="grid gap-2 text-sm text-stone-300">
            Password
            <input
              className="rounded-md border border-stone-700 bg-stone-950 px-3 py-2"
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete={flow === 'signUp' ? 'new-password' : 'current-password'}
            />
            <span className="text-xs text-stone-500">
              12+ characters with uppercase, lowercase, and a number.
            </span>
          </label>
        )}
        {needsCode && (
          <label className="grid gap-2 text-sm text-stone-300">
            Code
            <input
              className="rounded-md border border-stone-700 bg-stone-950 px-3 py-2 font-mono"
              name="code"
              required
              autoComplete="one-time-code"
            />
          </label>
        )}
        {flow === 'reset' && (
          <label className="grid gap-2 text-sm text-stone-300">
            New password
            <input
              className="rounded-md border border-stone-700 bg-stone-950 px-3 py-2"
              name="newPassword"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </label>
        )}
        <button
          className="rounded-md bg-amber-600 px-4 py-2 font-medium text-stone-950 disabled:opacity-50"
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
      {message && <output className="mt-4 block text-sm text-stone-300">{message}</output>}
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-amber-500">
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
  if (profile === undefined) return <p className="text-stone-400">Loading your account…</p>;
  return profile === null ? (
    <ProfileForm mode="onboarding" />
  ) : (
    <ProfileForm mode="edit" profile={profile} />
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
    <section className="rounded-xl border border-stone-800 bg-stone-900 p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-serif text-2xl">
          {mode === 'onboarding' ? 'Choose your table name' : 'Your account'}
        </h2>
        <button className="text-sm text-amber-500" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      {profile?.role === 'admin' && (
        <p className="mt-2 text-xs uppercase tracking-widest text-amber-500">
          Instance administrator
        </p>
      )}
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <label className="grid gap-2 text-sm text-stone-300">
          Display name
          <input
            className="rounded-md border border-stone-700 bg-stone-950 px-3 py-2"
            name="displayName"
            defaultValue={profile?.displayName}
            maxLength={60}
            required
          />
        </label>
        <label className="grid gap-2 text-sm text-stone-300">
          Handle
          <input
            className="rounded-md border border-stone-700 bg-stone-950 px-3 py-2"
            name="handle"
            defaultValue={profile?.handle}
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]+"
            required
          />
          <span className="text-xs text-stone-500">
            3–24 letters, numbers, or underscores. Used for exact friend discovery.
          </span>
        </label>
        <button
          className="rounded-md bg-amber-600 px-4 py-2 font-medium text-stone-950"
          type="submit"
        >
          {mode === 'onboarding' ? 'Enter En Garde' : 'Save profile'}
        </button>
      </form>
      {message && <output className="mt-4 block text-sm text-stone-300">{message}</output>}
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
