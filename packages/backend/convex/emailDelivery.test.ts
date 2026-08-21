import { afterEach, describe, expect, test, vi } from 'vitest';
import { deliverAuthEmail } from './emailDelivery';

const variableNames = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_EMAIL_API_TOKEN',
  'ENGARDE_EMAIL_FROM',
  'ENGARDE_AUTH_EMAIL_CONSOLE',
] as const;
const originalValues = Object.fromEntries(variableNames.map((name) => [name, process.env[name]]));
const message = { to: 'user@example.test', subject: 'Test', text: 'code', html: '<p>code</p>' };

afterEach(() => {
  for (const name of variableNames) {
    const value = originalValues[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.restoreAllMocks();
});

describe('auth email delivery configuration', () => {
  test('requires explicit console mode when Cloudflare is absent', async () => {
    for (const name of variableNames) delete process.env[name];
    await expect(deliverAuthEmail(message)).rejects.toThrow('not configured');
  });

  test('logs only when console mode is explicitly enabled', async () => {
    for (const name of variableNames) delete process.env[name];
    process.env.ENGARDE_AUTH_EMAIL_CONSOLE = 'true';
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await deliverAuthEmail(message);
    expect(info).toHaveBeenCalledWith(
      '[auth-email:console]',
      expect.objectContaining({ to: message.to }),
    );
  });

  test('rejects partial or ambiguous provider configuration', async () => {
    for (const name of variableNames) delete process.env[name];
    process.env.CLOUDFLARE_ACCOUNT_ID = 'account';
    await expect(deliverAuthEmail(message)).rejects.toThrow('not configured');
    process.env.ENGARDE_AUTH_EMAIL_CONSOLE = 'true';
    await expect(deliverAuthEmail(message)).rejects.toThrow('ambiguous');
  });
});
