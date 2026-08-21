import { createFileRoute } from '@tanstack/react-router';
import { AppScreen } from '../pages/campaigns/AppScreen';
import { CampaignsPage } from '../pages/campaigns/CampaignsPage';

export const Route = createFileRoute('/campaigns/')({
  component: () => (
    <AppScreen>
      <CampaignsPage />
    </AppScreen>
  ),
});
