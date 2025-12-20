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
import { isAuthenticated } from '../middleware/auth';

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
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
    throw redirect({ to: '/signup' });
  }
});

function LoginPage() {
  return <Login />;
}

function RegisterPage() {
  return <Register />;
}
