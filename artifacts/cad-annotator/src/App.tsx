/**
 * Root Application Component
 *
 * Sets up the global providers and client-side routing:
 * - QueryClientProvider: TanStack React Query for server state management
 * - TooltipProvider: Radix UI tooltip context
 * - WouterRouter: lightweight client-side routing
 * - Toaster: global toast notification container
 */
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";

/**
 * Shared React Query client instance.
 * Configured with sensible defaults — customise `defaultOptions` here
 * if you need different retry/stale-time behaviour.
 */
const queryClient = new QueryClient();

/** Defines the application's route table. */
function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

/** Root component that wraps the app in all required providers. */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
