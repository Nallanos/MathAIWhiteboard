/**
 * Protected Routes
 * 
 * Routes that require authentication.
 * These routes redirect to login if user is not authenticated.
 */

import { createRoute, redirect, Outlet } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { Dashboard } from '../../pages/Dashboard';
import { Whiteboard } from '../../pages/Whiteboard';
import { requireAuth } from '../middleware/auth';

export const protectedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  beforeLoad: () => {
    requireAuth();
  },
  component: () => <Outlet />,
});

export const dashboardRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/app',
  component: DashboardPage,
});

export const whiteboardRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/app/board/$boardId',
  component: WhiteboardPage,
});

function DashboardPage() {
  return <Dashboard />;
}

function WhiteboardPage() {
  const { boardId } = whiteboardRoute.useParams();
  return <Whiteboard boardId={boardId} />;
}
