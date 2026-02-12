import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import PricingPage from '../../pages/Pricing';

export const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pricing',
  component: PricingPageComponent,
});

function PricingPageComponent() {
  return <PricingPage />;
}
