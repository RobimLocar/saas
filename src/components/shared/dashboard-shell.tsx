"use client";

// FLUXYRA-STUDIO-SIDEBAR-UX-FIX-01 — the sidebar's open/collapsed state now
// lives here, one level above both the sidebar nav and the main content, so
// both can react to the same state instead of the sidebar animating its own
// width while <main> used a static margin that never matched it (the root
// cause of the sidebar overlaying the composer on hover-expand).
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

function DashboardMain({ children }: { children: React.ReactNode }) {
  const { open, animate } = useSidebar();
  const isExpanded = animate ? open : true;

  // Tailwind's class scanner needs literal strings — it can't resolve a
  // template-literal built from SIDEBAR_WIDTH_EXPANDED/COLLAPSED at build
  // time. These two values must stay in sync with those constants in
  // src/components/ui/sidebar.tsx (280px expanded / 72px collapsed).
  return (
    <main
      className={cn(
        "pt-[72px] transition-[margin-left] duration-300 ease-in-out",
        isExpanded ? "md:ml-[280px]" : "md:ml-[72px]"
      )}
    >
      {children}
    </main>
  );
}

export function DashboardShell({
  children,
  sidebar,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  return (
    <SidebarProvider animate>
      {sidebar}
      <DashboardMain>{children}</DashboardMain>
    </SidebarProvider>
  );
}
