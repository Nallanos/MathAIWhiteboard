/**
 * Auth Routes
 * 
 * Public routes for authentication.
 * These routes redirect to dashboard if user is already authenticated.
 */

import { createRoute, redirect } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { Login } from '../../pages/Login';
import { isAuthenticated } from '../middleware/auth';

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: (search.token as string) || undefined,
    };
  },
  beforeLoad: () => {
    // Redirect to dashboard if already authenticated
    if (isAuthenticated()) {
      throw redirect({ to: '/app' });
    }
  },
  component: LoginPage,
});

export const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: (search.token as string) || undefined,
    };
  },
  beforeLoad: () => {
    throw redirect({ to: '/login', search: { token: undefined } });
  },
  component: LoginPage,
});

export const registerRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  beforeLoad: () => {
    throw redirect({ to: '/login', search: { token: undefined } });
  }
});

function LoginPage() {
  return <Login />;
}
