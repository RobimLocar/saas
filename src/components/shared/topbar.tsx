import Link from "next/link";
import { Logo } from "@/components/shared/logo";

export function Topbar({ title = "Studio" }: { title?: string }) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-[68px] items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <Link href="/studio">
          <Logo showText={false} />
        </Link>
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
    </header>
  );
}
