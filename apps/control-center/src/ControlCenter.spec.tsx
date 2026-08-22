import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type FunctionReference, getFunctionName } from 'convex/server';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const queryResults = new Map<string, unknown>();
const mutationSpies = new Map<string, ReturnType<typeof vi.fn>>();
let authenticated = true;

function setQuery(ref: FunctionReference<'query'>, value: unknown) {
  queryResults.set(getFunctionName(ref), value);
}

function spyFor(ref: FunctionReference<'mutation'>) {
  const name = getFunctionName(ref);
  let spy = mutationSpies.get(name);
  if (!spy) {
    spy = vi.fn(() => Promise.resolve());
    mutationSpies.set(name, spy);
  }
  return spy;
}

vi.mock('convex/react', async () => {
  const { getFunctionName: nameOf } = await import('convex/server');
  return {
    AuthLoading: () => null,
    Authenticated: ({ children }: { children: ReactNode }) => (authenticated ? children : null),
    Unauthenticated: ({ children }: { children: ReactNode }) => (authenticated ? null : children),
    useQuery: (ref: Parameters<typeof nameOf>[0]) => queryResults.get(nameOf(ref)),
    useMutation: (ref: Parameters<typeof nameOf>[0]) =>
      spyFor(ref as FunctionReference<'mutation'>),
  };
});

const signOut = vi.fn(() => Promise.resolve());
vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: vi.fn(() => Promise.resolve()), signOut }),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import {
  SystemControlCenterAuditPage,
  SystemControlCenterPage,
  SystemControlCenterSetupPage,
} from './ControlCenter';

beforeEach(() => {
  queryResults.clear();
  mutationSpies.clear();
  signOut.mockClear();
  authenticated = true;
});

afterEach(cleanup);

describe('System Control Center', () => {
  test('routes an unestablished installation into sealed setup', () => {
    setQuery(api.operators.setupStatus, 'setup_pending');
    render(<SystemControlCenterPage />);
    expect(screen.getByRole('heading', { name: /has not been established/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open sealed setup' }).getAttribute('href')).toBe(
      '/setup',
    );
  });

  test('bootstraps the first Operator with the deployment capability', () => {
    setQuery(api.operators.setupStatus, 'setup_pending');
    render(<SystemControlCenterSetupPage />);
    fireEvent.change(screen.getByLabelText('Instance name'), {
      target: { value: 'The Iron Yard' },
    });
    fireEvent.change(screen.getByLabelText('One-time setup capability'), {
      target: { value: 'one-time-capability' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Complete installation setup' }));
    expect(spyFor(api.operators.bootstrap)).toHaveBeenCalledWith({
      instanceName: 'The Iron Yard',
      capability: 'one-time-capability',
    });
  });

  test('lets an Operator grant a verified identity by email', () => {
    const userId = 'operator-id' as Id<'users'>;
    setQuery(api.operators.setupStatus, 'setup_complete');
    setQuery(api.operators.current, true);
    setQuery(api.instance.getName, 'The Iron Yard');
    setQuery(api.operators.list, [
      {
        userId,
        email: 'operator@example.test',
        status: 'active',
        source: 'provisioned',
        grantedAt: 1,
        isCurrent: true,
      },
    ]);
    render(<SystemControlCenterPage />);
    expect(screen.getByRole('heading', { name: 'The Iron Yard' })).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('New Operator email'), {
      target: { value: 'candidate@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grant Operator access' }));
    expect(spyFor(api.operators.grantByEmail)).toHaveBeenCalledWith({
      email: 'candidate@example.test',
    });
  });

  test('shows only Operators the attributed audit trail', () => {
    setQuery(api.operators.setupStatus, 'setup_complete');
    setQuery(api.operators.current, true);
    setQuery(api.operators.listAudit, [
      {
        eventId: 'event-id' as Id<'operatorAuditEvents'>,
        type: 'operator_granted',
        actorEmail: 'operator@example.test',
        subjectEmail: 'candidate@example.test',
        occurredAt: 1,
      },
    ]);
    render(<SystemControlCenterAuditPage />);
    expect(screen.getByRole('heading', { name: 'Operator audit trail' })).toBeTruthy();
    expect(screen.getByText('operator@example.test')).toBeTruthy();
    expect(screen.getByText('candidate@example.test')).toBeTruthy();
  });

  test('denies an authenticated identity without Operator entitlement', () => {
    setQuery(api.operators.setupStatus, 'setup_complete');
    setQuery(api.operators.current, false);
    render(<SystemControlCenterPage />);
    expect(screen.getByRole('heading', { name: 'Operator entitlement required' })).toBeTruthy();
  });
});
