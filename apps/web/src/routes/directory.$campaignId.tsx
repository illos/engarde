import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { createFileRoute } from '@tanstack/react-router';
import { AppScreen } from '../pages/campaigns/AppScreen';
import { JoinScreen } from '../pages/campaigns/JoinScreen';

// Join screen reached from a public directory listing (route 1). Private
// campaigns answer not-found on this path by design — links into private
// campaigns travel as /join/<code>.
export const Route = createFileRoute('/directory/$campaignId')({
  component: () => {
    const { campaignId } = Route.useParams();
    return (
      <AppScreen>
        <JoinScreen campaignId={campaignId as Id<'campaigns'>} />
      </AppScreen>
    );
  },
});
