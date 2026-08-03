import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();
const ReporterDashboard = lazy(() => import("./pages/ReporterDashboard"));
const AuthorityDashboard = lazy(() => import("./pages/AuthorityDashboard"));
const NgoDashboard = lazy(() => import("./pages/NgoDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

const PageLoader = () => (
  <div className="flex min-h-svh items-center justify-center bg-background px-4 text-sm text-muted-foreground">
    Loading...
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
            <Route path="/dashboard/reporter/*" element={<ReporterDashboard />} />
            <Route path="/dashboard/authority/*" element={<AuthorityDashboard />} />
            <Route path="/dashboard/ngo/*" element={<NgoDashboard />} />
            <Route path="/dashboard/admin/*" element={<AdminDashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
