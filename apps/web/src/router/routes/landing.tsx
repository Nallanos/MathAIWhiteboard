import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { Landing } from '../../pages/Landing';

export const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
});

function LandingPage() {
  return <Landing />;
}
