import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { createFileRoute } from '@tanstack/react-router';
import { AppScreen } from '../pages/campaigns/AppScreen';
import { BuilderPage } from '../pages/characters/BuilderPage';

export const Route = createFileRoute('/characters/$characterId/build')({
  component: () => {
    // A malformed ID fails the query's v.id validator server-side, which the
    // page renders as an error — same as a stranger's ID.
    const { characterId } = Route.useParams();
    return (
      <AppScreen>
        <BuilderPage characterId={characterId as Id<'characters'>} />
      </AppScreen>
    );
  },
});
