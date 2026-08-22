import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { createFileRoute } from '@tanstack/react-router';
import { AppScreen } from '../pages/campaigns/AppScreen';
import { TablePage } from '../pages/table/TablePage';

export const Route = createFileRoute('/table/$campaignId')({
  component: () => {
    // A malformed ID fails the query's v.id validator server-side, which the
    // page's QueryBoundary renders as not-found — same as a stranger's ID.
    const { campaignId } = Route.useParams();
    return (
      <AppScreen>
        <TablePage campaignId={campaignId as Id<'campaigns'>} />
      </AppScreen>
    );
  },
});
