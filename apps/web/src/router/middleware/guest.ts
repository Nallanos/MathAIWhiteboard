/**
 * Guest Middleware
 * 
 * Middleware for routes that should only be accessible to non-authenticated users.
 * Used for login/register pages to redirect authenticated users away.
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
 * Require guest (non-authenticated) status to access a route.
 * Throws a redirect to / (dashboard) if already authenticated.
 */
export function requireGuest(): void {
  if (isAuthenticated()) {
    throw redirect({ to: '/' });
  }
}
