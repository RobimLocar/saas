import { MotionConfig } from "framer-motion";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";

// FLUXYRA-LANDING-PREMIUM-REDESIGN-01 — light editorial theme scoped to this
// route group only via the `marketing-theme` class (defined in globals.css).
// The rest of the app (Studio/dashboard) stays on the dark theme applied at
// the <html> root in src/app/layout.tsx — untouched.
//
// FLUXYRA-LANDING-MOTION-PASS-05 — MotionConfig reducedMotion="user" makes
// every framer-motion animation on this route group respect the OS-level
// prefers-reduced-motion setting automatically (strips transform-driven
// motion, keeps simple opacity fades) — no manual media-query juggling
// needed in each component.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="marketing-theme min-h-screen bg-background text-foreground">
        <MarketingNavbar />
        <main className="pt-24">{children}</main>
        <MarketingFooter />
      </div>
    </MotionConfig>
  );
}
