import { createFileRoute } from '@tanstack/react-router';
import { AppScreen } from '../pages/campaigns/AppScreen';
import { DirectoryPage } from '../pages/campaigns/DirectoryPage';

export const Route = createFileRoute('/directory/')({
  component: () => (
    <AppScreen>
      <DirectoryPage />
    </AppScreen>
  ),
});
