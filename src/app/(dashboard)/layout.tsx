import type { ReactNode } from "react";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
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
      <Sidebar
        credits={profile?.credits_balance ?? 0}
        initials={initialsFromProfile(profile)}
      />
      <main className="ml-[220px] min-w-0 overflow-x-clip pt-[72px]">{children}</main>
    </div>
  );
}
