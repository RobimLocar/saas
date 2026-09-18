import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";

// FLUXYRA-LANDING-PREMIUM-REDESIGN-01 — light editorial theme scoped to this
// route group only via the `marketing-theme` class (defined in globals.css).
// The rest of the app (Studio/dashboard) stays on the dark theme applied at
// the <html> root in src/app/layout.tsx — untouched.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-theme min-h-screen bg-background text-foreground">
      <MarketingNavbar />
      <main className="pt-24">{children}</main>
      <MarketingFooter />
    </div>
  );
}
