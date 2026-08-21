type AuthEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type CloudflareResponse = {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
};

export async function deliverAuthEmail(message: AuthEmail): Promise<void> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_EMAIL_API_TOKEN;
  const from = process.env.ENGARDE_EMAIL_FROM;
  const consoleMode = process.env.ENGARDE_AUTH_EMAIL_CONSOLE === 'true';
  const configuredValues = [accountId, apiToken, from].filter(Boolean).length;

  if (consoleMode) {
    if (configuredValues !== 0) {
      throw new Error(
        'Auth email configuration is ambiguous: console mode cannot be combined with Cloudflare settings',
      );
    }
    console.info('[auth-email:console]', {
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return;
  }

  if (configuredValues !== 3 || !accountId || !apiToken || !from) {
    throw new Error(
      'Auth email delivery is not configured: set all Cloudflare email variables or explicitly enable ENGARDE_AUTH_EMAIL_CONSOLE=true',
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: message.to,
        from,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    },
  );
  const result = (await response.json()) as CloudflareResponse;
  if (!response.ok || !result.success) {
    const detail = result.errors?.map(({ code, message }) => `${code}: ${message}`).join(', ');
    throw new Error(`Auth email delivery failed${detail ? ` (${detail})` : ''}`);
  }
}
