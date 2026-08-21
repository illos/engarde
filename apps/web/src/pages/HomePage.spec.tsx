import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  test('renders the app name and substrate status', () => {
    render(<HomePage backendConfigured={false} />);
    expect(screen.getByRole('heading', { name: 'En Garde' })).toBeTruthy();
    expect(screen.getByText('Substrate status')).toBeTruthy();
    // No VITE_CONVEX_URL in the test environment → the unconfigured state shows.
    expect(screen.getByText(/not configured/)).toBeTruthy();
  });
});
