"use client";

// FLUXYRA-STUDIO-SIDEBAR-ORIGINAL-BEHAVIOR-RESTORE — sidebar goes back to
// the original interaction: collapsed/compact by default, expands on
// hover with a smooth width animation. Still navigation-only (no
// credits/billing/settings/logout — those stay in the Topbar's UserMenu).
//
// This is entirely self-contained inside the sidebar: <main>'s margin
// (md:ml-[240px] in (dashboard)/layout.tsx) and the composer's offset
// (md:left-[calc(50%+120px)] in generation-dock.tsx) already reserve a
// gutter sized for this sidebar's *expanded* width, regardless of whether
// it's currently rendered collapsed or expanded. So hovering to expand
// never reaches into the gallery or covers the composer — nothing outside
// this file needs to change.
//
// Desktop hover-state and the mobile hamburger drawer get their own,
// separate SidebarProvider instances: they share the same underlying
// context implementation, but DesktopSidebar's onMouseEnter/onMouseLeave
// would otherwise flip the same `open` flag that controls the mobile
// full-screen drawer's visibility, popping it open on desktop hover.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
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
import {
  DesktopSidebar,
  MobileSidebar,
  Sidebar as SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";

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
  const { open, animate } = useSidebar();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const expanded = animate ? open : true;

  return (
    <nav className="flex flex-col gap-2">
      {navItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-2.5 rounded-lg border-l-2 px-2.5 py-3 text-sm transition-colors",
              active
                ? "border-[#7C3AED] bg-[#7C3AED]/15 text-white"
                : "border-transparent text-neutral-300 hover:bg-white/5"
            )}
          >
            <item.icon
              className={cn("h-5 w-5 shrink-0", active ? "text-[#8B5CF6]" : "text-[#888888]")}
            />
            <motion.span
              animate={{
                display: animate ? (open ? "inline-block" : "none") : "inline-block",
                opacity: expanded ? 1 : 0,
              }}
              className={cn("whitespace-pre", active && "font-medium")}
            >
              {t(item.labelKey)}
            </motion.span>
            {item.badge && (
              <motion.span
                animate={{
                  display: animate ? (open ? "inline-block" : "none") : "inline-block",
                  opacity: expanded ? 1 : 0,
                }}
                className="ml-auto rounded bg-[#2A2A2A] px-1.5 py-0.5 text-[9px] font-semibold text-[#A3A3A3]"
              >
                {item.badge}
              </motion.span>
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
 * live in the Topbar's user menu (see topbar.tsx). Desktop: collapsed
 * (icons only) by default, expands on hover. Mobile: unchanged hamburger
 * drawer, independent open state. */
export function Sidebar() {
  return (
    <>
      <SidebarProvider>
        <DesktopSidebar className="fixed left-2.5 top-[80px] z-20 h-fit overflow-hidden rounded-2xl border border-[#242428] bg-[#0f0f11]/95 px-3 py-3 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur">
          <NavLinks />
        </DesktopSidebar>
      </SidebarProvider>

      <SidebarProvider animate={false}>
        <MobileNav />
      </SidebarProvider>
    </>
  );
}
