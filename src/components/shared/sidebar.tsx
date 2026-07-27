"use client";

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
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DesktopSidebar,
  MobileSidebar,
  Sidebar as SidebarPrimitive,
  SidebarLink,
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  badge?: string;
};

const mainNav: NavItem[] = [
  { href: "/studio", label: "Studio", icon: LayoutGrid },
  { href: "/flows", label: "Flows", icon: Workflow },
  { href: "/wise", label: "Wise", icon: WandSparkles, badge: "BETA" },
];

const appsNav: NavItem[] = [
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

function SidebarContent({ credits, initials }: { credits: number; initials: string }) {
  const pathname = usePathname();
  const { open, animate } = useSidebar();

  const isExpanded = animate ? open : true;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    const iconClass = cn(
      "h-[18px] w-[18px] shrink-0",
      active ? "text-[#8B5CF6]" : "text-[#888888]"
    );

    if (item.badge) {
      return (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "group/sidebar flex items-center gap-2 rounded-lg border-l-2 px-2 py-2 transition-colors",
            active
              ? "border-[#7C3AED] bg-[#7C3AED]/15 text-white"
              : "border-transparent text-neutral-300 hover:bg-white/5"
          )}
        >
          <item.icon className={iconClass} />

          <motion.span
            animate={{
              display: animate ? (open ? "inline-flex" : "none") : "inline-flex",
              opacity: animate ? (open ? 1 : 0) : 1,
            }}
            className="items-center gap-1.5 whitespace-pre text-sm"
          >
            <span className={cn("transition duration-150 group-hover/sidebar:translate-x-1", active && "font-medium")}>{item.label}</span>
            <span className="rounded bg-[#2A2A2A] px-1.5 py-0.5 text-[9px] font-semibold text-[#A3A3A3]">
              {item.badge}
            </span>
          </motion.span>
        </Link>
      );
    }

    return (
      <SidebarLink
        key={item.href}
        link={{
          href: item.href,
          label: item.label,
          icon: <item.icon className={iconClass} />,
        }}
        className={cn(
          "border-l-2 transition-colors",
          active
            ? "border-[#7C3AED] bg-[#7C3AED]/15 text-white"
            : "border-transparent text-neutral-300 hover:bg-white/5"
        )}
      />
    );
  };

  return (
    <>
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#6D28D9]">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <motion.span
          animate={{
            display: animate ? (open ? "inline-block" : "none") : "inline-block",
            opacity: animate ? (open ? 1 : 0) : 1,
          }}
          className="text-lg font-bold text-white"
        >
          Fluxyra
        </motion.span>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto">
        {mainNav.map(renderItem)}

        <motion.p
          animate={{
            display: animate ? (open ? "block" : "none") : "block",
            opacity: animate ? (open ? 1 : 0) : 1,
          }}
          className="px-3 pb-2 pt-5 text-[10px] font-semibold tracking-widest text-neutral-500"
        >
          TODOS OS APPS
        </motion.p>

        {appsNav.map(renderItem)}
      </div>

      <div className="mt-2 border-t border-[#2A2A2A] pt-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-[#EA580C] to-[#C2410C] px-2.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Zap className="h-3 w-3" fill="currentColor" />
            <motion.span
              animate={{
                display: isExpanded ? "inline-block" : "none",
                opacity: isExpanded ? 1 : 0,
              }}
            >
              {credits}
            </motion.span>
          </Link>

          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1A1A] text-xs font-semibold text-[#F5F5F5]">
            {initials}
          </div>
        </div>
      </div>
    </>
  );
}

export function Sidebar({ credits = 0, initials = "FL" }: SidebarProps) {
  return (
    <SidebarPrimitive animate>
      <DesktopSidebar className="fixed left-0 top-[72px] z-20 h-[calc(100vh-88px)] rounded-r-2xl border border-[#2A2A2A] bg-[#111111]/95 backdrop-blur">
        <SidebarContent credits={credits} initials={initials} />
      </DesktopSidebar>

      <MobileSidebar className="fixed left-0 top-[72px] z-20 border-b border-[#2A2A2A] bg-[#111111]">
        <SidebarContent credits={credits} initials={initials} />
      </MobileSidebar>
    </SidebarPrimitive>
  );
}
