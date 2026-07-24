import type { LucideIcon } from "lucide-react";

export function PagePlaceholder({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[calc(100vh-72px)] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card">
        <Icon className="h-6 w-6 text-accent" />
      </div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
