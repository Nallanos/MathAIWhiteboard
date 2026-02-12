/**
 * Auth Routes
 * 
 * Public routes for authentication (login, register).
 * These routes redirect to dashboard if user is already authenticated.
 */

import { createRoute, redirect } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { Login } from '../../pages/Login';
import { Register } from '../../pages/Register';
import { EmailVerified } from '../../pages/EmailVerified';
import { isAuthenticated } from '../middleware/auth';

export const emailVerifiedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/email-verified',
  validateSearch: (search: Record<string, unknown>) => {
    return {
      success: (search.success as string) || undefined,
      error: (search.error as string) || undefined,
    };
  },
  component: EmailVerified,
});

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
    if (isAuthenticated()) {
      throw redirect({ to: '/app' });
    }
  },
  component: RegisterPage,
});

export const registerRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  beforeLoad: () => {
    throw redirect({ to: '/signup', search: { token: undefined } });
  }
});

function LoginPage() {
  return <Login />;
}

function RegisterPage() {
  return <Register />;
}
