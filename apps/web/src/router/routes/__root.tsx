/**
 * Root Route Definition
 * 
 * This is the root route that wraps all other routes.
 * It provides the AuthContext to all child routes.
 */

import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '../../context/AuthContext';

export const rootRoute = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
