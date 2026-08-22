import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { components } from './_generated/api';

// Product-abuse limits, separate from infrastructure-level DDoS protection.
// Keys are authenticated user IDs except for the campaign-wide chat ceiling.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  joinCodePreview: { kind: 'fixed window', rate: 20, period: 15 * MINUTE },
  joinRequest: { kind: 'fixed window', rate: 30, period: 15 * MINUTE },
  lobbyMessageUser: { kind: 'token bucket', rate: 20, period: MINUTE, capacity: 5 },
  lobbyMessageCampaign: { kind: 'token bucket', rate: 100, period: MINUTE, capacity: 20 },
});
