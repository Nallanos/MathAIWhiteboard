/**
 * Auth Middleware
 * 
 * Middleware to protect routes that require authentication.
 * Redirects to signup page if user is not authenticated.
 */

import { redirect } from '@tanstack/react-router';

/**
 * Check if user is authenticated by looking for auth token in localStorage
 */
export function isAuthenticated(): boolean {
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('authUser');
  return !!(token && user);
}

/**
 * Require authentication to access a route.
 * Throws a redirect to /signup if not authenticated.
 */
export function requireAuth(): void {
  if (!isAuthenticated()) {
    throw redirect({ to: '/signup', search: { token: undefined } });
  }
}
