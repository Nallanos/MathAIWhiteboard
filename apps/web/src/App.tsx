/**
 * App Entry Point
 * 
 * Main application component that sets up the TanStack Router.
 * All routing logic is handled by the router configuration.
 */

import { RouterProvider } from './router';
import 'katex/dist/katex.min.css';

export default function App() {
  return <RouterProvider />;
}
