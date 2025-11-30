/**
 * Protected Routes
 * 
 * Routes that require authentication.
 * These routes redirect to login if user is not authenticated.
 */

import { createRoute, redirect } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { Dashboard } from '../../pages/Dashboard';
import { Whiteboard } from '../../pages/Whiteboard';
import { requireAuth } from '../middleware/auth';

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    requireAuth();
  },
  component: DashboardPage,
});

export const whiteboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/board/$boardId',
  beforeLoad: () => {
    requireAuth();
  },
  component: WhiteboardPage,
});

function DashboardPage() {
  return <Dashboard />;
}

function WhiteboardPage() {
  const { boardId } = whiteboardRoute.useParams();
  return <Whiteboard boardId={boardId} />;
}
