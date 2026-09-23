import type { ReactNode } from "react";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { DashboardShell } from "@/components/shared/dashboard-shell";
import { getCurrentProfile, initialsFromProfile } from "@/lib/supabase/queries";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await getCurrentProfile();

  return (
    <div className="relative min-h-screen bg-background">
      <Topbar />
      <DashboardShell
        sidebar={
          <Sidebar
            credits={profile?.credits_balance ?? 0}
            initials={initialsFromProfile(profile)}
            email={profile?.email ?? null}
          />
        }
      >
        {children}
      </DashboardShell>
    </div>
  );
}
