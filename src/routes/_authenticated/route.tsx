import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfile } from "@/lib/finance.functions";
import { AppLayout } from "@/components/app-layout";
import { RouteError, RouteNotFound } from "@/components/route-states";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    try {
      await ensureProfile();
    } catch (e) {
      // Don't blank the whole app if profile setup hiccups; pages still load.
      console.warn("ensureProfile failed", e);
    }
    return { user: data.user };
  },
  errorComponent: ({ error }) => (
    <div className="p-6">
      <RouteError error={error instanceof Error ? error : new Error("Something went wrong")} />
    </div>
  ),
  notFoundComponent: RouteNotFound,
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});
