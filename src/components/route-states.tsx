import { Button } from "@/components/ui/button";
import { Link, type ErrorComponentProps } from "@tanstack/react-router";

export function RouteError({ error }: Partial<ErrorComponentProps>) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <h2 className="font-display text-xl font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {(error instanceof Error && error.message) || "An unexpected error occurred while loading this page."}
      </p>
      <Button className="mt-5" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}

export function RouteNotFound() {
  return (
    <div className="rounded-xl border border-dashed px-6 py-10 text-center">
      <h2 className="font-display text-xl font-semibold">Page not found</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        That page doesn't exist.{" "}
        <Link to="/dashboard" className="text-primary hover:underline">
          Back to the dashboard
        </Link>
      </p>
    </div>
  );
}
