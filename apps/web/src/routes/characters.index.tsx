import { createFileRoute } from '@tanstack/react-router';
import { AppScreen } from '../pages/campaigns/AppScreen';
import { CharactersPage } from '../pages/characters/CharactersPage';

export const Route = createFileRoute('/characters/')({
  component: () => (
    <AppScreen>
      <CharactersPage />
    </AppScreen>
  ),
});
