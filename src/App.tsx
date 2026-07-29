import { Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LockScreen from "@/pages/lock-screen";
import AdminPanel from "@/pages/admin-panel";
import InjectSite from "@/pages/inject-site";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function AppRouter() {
  const { role, restoring } = useAuth();

  if (restoring) {
    return (
      <div className="min-h-screen bg-[#050508] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-zinc-600 text-sm tracking-widest uppercase">Loading...</p>
        </div>
      </div>
    );
  }

  if (role === "admin") return <AdminPanel />;
  if (role === "user") return <InjectSite />;
  return <LockScreen />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}