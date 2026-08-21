import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import type { EmailConfig } from '@convex-dev/auth/server';
import { internal } from './_generated/api';
import type { ActionCtx } from './_generated/server';
import { deliverAuthEmail } from './emailDelivery';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character] ?? character,
  );
}

function codeEmail(id: string, purpose: string): EmailConfig {
  return {
    id,
    name: `En Garde ${purpose}`,
    type: 'email',
    maxAge: 15 * 60,
    async sendVerificationRequest({ identifier, token }, ctx?: ActionCtx) {
      if (!ctx) throw new Error('Auth email action context is unavailable');
      await ctx.runMutation(internal.emailRateLimits.consume, {
        identifier,
        purpose: id,
      });
      const safeToken = escapeHtml(token);
      await deliverAuthEmail({
        to: identifier,
        subject: `En Garde ${purpose}`,
        text: `Your En Garde ${purpose.toLowerCase()} code is: ${token}\n\nThis code expires in 15 minutes.`,
        html: `<p>Your En Garde ${escapeHtml(purpose.toLowerCase())} code is:</p><p><strong>${safeToken}</strong></p><p>This code expires in 15 minutes.</p>`,
      });
    },
  };
}

const verifyEmail = codeEmail('password-verify', 'email verification');
const resetPassword = codeEmail('password-reset', 'password reset');

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      verify: verifyEmail,
      reset: resetPassword,
      profile(params) {
        const email = String(params.email ?? '')
          .trim()
          .toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid credentials');
        return { email };
      },
      validatePasswordRequirements(password) {
        if (
          password.length < 12 ||
          !/[a-z]/.test(password) ||
          !/[A-Z]/.test(password) ||
          !/[0-9]/.test(password)
        ) {
          throw new Error('Password does not meet requirements');
        }
      },
    }),
  ],
});
