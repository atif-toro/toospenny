import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CreditCard,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  PiggyBank,
  Sun,
  Target,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { SpennyLogo } from "@/components/brand";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/debts", label: "Debts", icon: CreditCard },
  { to: "/payoff", label: "Payoff planner", icon: ListOrdered },
] as const;

function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("spenny-theme") === "dark";
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("spenny-theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
              (active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground")
            }
          >
            <Icon className={"h-4 w-4 " + (active ? "text-sidebar-primary" : "")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function BrandMark() {
  return (
    <Link to="/dashboard" className="flex items-center">
      <SpennyLogo size="md" textClassName="text-sidebar-foreground" />
    </Link>
  );
}

function ThemeToggle({ dark, toggle }: { dark: boolean; toggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between bg-sidebar p-4 md:flex">
        <div>
          <div className="px-1 py-2">
            <BrandMark />
          </div>
          <div className="mt-6">
            <NavItems />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-sidebar-border pt-3">
          <ThemeToggle dark={dark} toggle={toggle} />
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between bg-sidebar px-4 md:hidden">
        <BrandMark />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-4">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="py-2">
              <BrandMark />
            </div>
            <div className="mt-6">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-sidebar-border pt-3">
              <ThemeToggle dark={dark} toggle={toggle} />
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <main className="min-w-0 flex-1 px-4 pt-16 pb-16 md:px-8 md:pt-8">{children}</main>
    </div>
  );
}
