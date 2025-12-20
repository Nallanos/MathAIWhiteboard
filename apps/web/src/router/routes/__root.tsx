/**
 * Root Route Definition
 * 
 * This is the root route that wraps all other routes.
 * It provides the AuthContext to all child routes.
 */

import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';

import { AuthProvider } from '../../context/AuthContext';
import { capturePageview } from '../../lib/posthog';

export const rootRoute = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const location = useRouterState({ select: (s) => s.location });

  useEffect(() => {
    capturePageview(window.location.href);
  }, [location.pathname, location.search, location.hash]);

  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
