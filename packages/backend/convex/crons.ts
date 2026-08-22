import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval(
  'remove expired operational data',
  { hours: 1 },
  internal.retention.cleanupExpired,
  {},
);

export default crons;
