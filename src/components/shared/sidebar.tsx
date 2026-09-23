"use client";

// FLUXYRA-STUDIO-NAVIGATION-UX-PASS-02 — the sidebar is navigation only now:
// no credits/billing/settings/logout, no hover-driven expand/collapse, no
// shared layout state with <main> or the composer. It's a self-contained,
// fixed-width component again (its own SidebarProvider, scoped internally,
// used only to drive the mobile hamburger drawer's open/close — desktop
// never changes width, so there's nothing else to synchronize).
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  Copy,
  Folder,
  LayoutGrid,
  Sprout,
  Users,
  WandSparkles,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { MobileSidebar, Sidebar as SidebarProvider, useSidebar } from "@/components/ui/sidebar";

type NavItem = {
  href: string;
  labelKey: string;
  icon: typeof LayoutGrid;
  badge?: string;
};

const navItems: NavItem[] = [
  { href: "/studio", labelKey: "studio", icon: LayoutGrid },
  { href: "/flows", labelKey: "flows", icon: Workflow },
  { href: "/wise", labelKey: "wise", icon: WandSparkles, badge: "BETA" },
  { href: "/influencer", labelKey: "influencer", icon: Users },
  { href: "/ugc", labelKey: "ugc", icon: Clapperboard },
  { href: "/seeds", labelKey: "seeds", icon: Sprout },
  { href: "/assets", labelKey: "assets", icon: Folder },
  { href: "/my-prompts", labelKey: "myPrompts", icon: Copy },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="flex flex-col gap-0.5">
      {navItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-2.5 rounded-lg border-l-2 px-2.5 py-1.5 text-sm transition-colors",
              active
                ? "border-[#7C3AED] bg-[#7C3AED]/15 text-white"
                : "border-transparent text-neutral-300 hover:bg-white/5"
            )}
          >
            <item.icon
              className={cn("h-[18px] w-[18px] shrink-0", active ? "text-[#8B5CF6]" : "text-[#888888]")}
            />
            <span className={cn("whitespace-pre", active && "font-medium")}>{t(item.labelKey)}</span>
            {item.badge && (
              <span className="ml-auto rounded bg-[#2A2A2A] px-1.5 py-0.5 text-[9px] font-semibold text-[#A3A3A3]">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileNav() {
  const { setOpen } = useSidebar();
  return (
    <MobileSidebar className="fixed left-0 top-[72px] z-20 border-b border-[#2A2A2A] bg-[#111111]">
      <NavLinks onNavigate={() => setOpen(false)} />
    </MobileSidebar>
  );
}

/** Pure app navigation — Studio/Flows/Wise/Influencer Studio/Fábrica UGC/
 * Seeds/Assets/Meus Prompts only. Account, credits, billing and logout all
 * live in the Topbar's user menu now (see topbar.tsx).
 *
 * FLUXYRA-STUDIO-NAVIGATION-POLISH-01 — height sized to content (h-fit)
 * instead of stretching to fill the viewport, so the card doesn't carry a
 * large empty gap below the last item. */
export function Sidebar() {
  return (
    <SidebarProvider animate={false}>
      <aside className="fixed left-2.5 top-[80px] z-20 hidden h-fit w-[240px] flex-col rounded-2xl border border-[#242428] bg-[#0f0f11]/95 px-3 py-3 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur md:flex">
        <NavLinks />
      </aside>
      <MobileNav />
    </SidebarProvider>
  );
}
