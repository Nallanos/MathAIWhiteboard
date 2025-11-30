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
      throw redirect({ to: '/' });
    }
  },
  component: LoginPage,
});

export const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  beforeLoad: () => {
    // Redirect to dashboard if already authenticated
    if (isAuthenticated()) {
      throw redirect({ to: '/' });
    }
  },
  component: RegisterPage,
});

function LoginPage() {
  return <Login />;
}

function RegisterPage() {
  return <Register />;
}
