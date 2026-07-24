"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Workflow,
  WandSparkles,
  Users,
  Clapperboard,
  Sprout,
  Folder,
  Copy,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const mainNav = [
  { href: "/studio", label: "Studio", icon: LayoutGrid },
  { href: "/flows", label: "Flows", icon: Workflow },
  { href: "/wise", label: "Wise", icon: WandSparkles, badge: "BETA" },
];

const appsNav = [
  { href: "/influencer", label: "Influencer Studio", icon: Users },
  { href: "/ugc", label: "UGC Factory", icon: Clapperboard },
  { href: "/seeds", label: "Seeds", icon: Sprout },
  { href: "/assets", label: "Assets", icon: Folder },
  { href: "/my-prompts", label: "My Prompts", icon: Copy },
];

interface SidebarProps {
  credits?: number;
  initials?: string;
}

export function Sidebar({ credits = 0, initials = "FL" }: SidebarProps) {
  const pathname = usePathname();

  const NavLink = ({
    href,
    label,
    icon: Icon,
    badge,
  }: {
    href: string;
    label: string;
    icon: typeof LayoutGrid;
    badge?: string;
  }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
          active
            ? "bg-primary/15 text-foreground"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        <Icon
          className={cn("h-[18px] w-[18px] shrink-0", active && "text-accent")}
        />
        <span className={cn(active && "font-medium")}>{label}</span>
        {badge && (
          <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav className="fixed left-0 top-[72px] z-20 flex h-[calc(100vh-88px)] w-[220px] flex-col rounded-r-2xl border border-border bg-sidebar/95 py-4 backdrop-blur">
      <div className="flex-1 space-y-1 overflow-y-auto px-3">
        {mainNav.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        <p className="px-3 pb-2 pt-5 text-[10px] font-semibold tracking-widest text-muted-foreground/60">
          TODOS OS APPS
        </p>

        {appsNav.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </div>

      <div className="mx-3 mt-2 flex items-center justify-between border-t border-border pt-3">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-[#EA580C] to-[#C2410C] px-2.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Zap className="h-3 w-3" fill="currentColor" />
          {credits}
        </Link>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
          {initials}
        </div>
      </div>
    </nav>
  );
}
