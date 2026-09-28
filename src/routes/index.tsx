import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, ChartPie, Landmark, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Spenny — See all your money in one place",
      },
      {
        name: "description",
        content:
          "Spenny brings your accounts, spending, budgets, goals and debts together — with a payoff planner to get you debt-free.",
      },
      {
        property: "og:title",
        content: "Spenny — See all your money in one place",
      },
      {
        property: "og:description",
        content:
          "Track accounts, income, expenses, savings, investments and debts — with Snowball and Avalanche payoff plans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  // Already signed in? Straight to the dashboard.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Brand />
        <nav className="flex items-center gap-3">
          <Button variant="ghost" asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/auth">Get started</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="pt-16 pb-20 text-center md:pt-24">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Personal finance, mapped out
          </p>
          <h1 className="font-display mx-auto mt-4 max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight md:text-6xl">
            See all your money in one place — and finally pay it off.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Accounts, spending, budgets, goals and debts in one calm, clear view. Spenny shows you
            exactly when you'll be debt-free.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">
                Start free <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <FeatureCard
            icon={<Landmark className="h-5 w-5" />}
            title="Everything in one place"
            body="Current accounts, savings, credit cards, loans and investments — your whole net worth at a glance."
          />
          <FeatureCard
            icon={<ChartPie className="h-5 w-5" />}
            title="Spending that makes sense"
            body="Budgets by category, monthly cash flow and 12-month trends, so you always know what's left."
          />
          <FeatureCard
            icon={<Target className="h-5 w-5" />}
            title="A plan to be debt-free"
            body="Compare Snowball and Avalanche payoff plans side by side and see your debt-free date."
          />
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        Spenny — your money, mapped.
      </footer>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center">
      <SpennyLogo size="md" />
    </Link>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-card p-6 text-left shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </div>
      <h3 className="font-display mt-4 text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
