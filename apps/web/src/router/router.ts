/**
 * Router Instance
 * 
 * Creates and exports the TanStack Router instance with all routes configured.
 */

import { createRouter } from '@tanstack/react-router';
import {
  rootRoute,
  loginRoute,
  signupRoute,
  registerRedirectRoute,
  landingRoute,
  dashboardRoute,
  whiteboardRoute,
} from './routes';

// Build the route tree
const routeTree = rootRoute.addChildren([
  landingRoute,
  dashboardRoute,
  whiteboardRoute,
  loginRoute,
  signupRoute,
  registerRedirectRoute,
]);

// Create the router instance
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

// Register the router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
