import { createFileRoute } from '@tanstack/react-router';
import { AppScreen } from '../pages/campaigns/AppScreen';
import { JoinScreen } from '../pages/campaigns/JoinScreen';

// Join screen reached by share link (route 3) or a typed share code
// (route 2 — the code form navigates here). The link IS the code.
export const Route = createFileRoute('/join/$code')({
  component: () => {
    const { code } = Route.useParams();
    return (
      <AppScreen>
        <JoinScreen code={code} />
      </AppScreen>
    );
  },
});
