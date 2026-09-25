import type { ReactNode } from "react";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { getCurrentProfile, initialsFromProfile } from "@/lib/supabase/queries";

// FLUXYRA-STUDIO-NAVIGATION-UX-PASS-02 — sidebar is a fixed 240px static
// rail (no expand/collapse, so no shared state needed with <main>) —
// DashboardShell's dynamic margin-syncing is gone. Account/credits/billing
// moved to the Topbar's user menu, so only it needs the profile data now.
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await getCurrentProfile();

  return (
    <div className="relative min-h-screen bg-background">
      <Topbar
        credits={profile?.credits_balance ?? 0}
        initials={initialsFromProfile(profile)}
        email={profile?.email ?? null}
      />
      <Sidebar />
      <main className="pt-[72px] md:ml-[240px]">{children}</main>
    </div>
  );
}
