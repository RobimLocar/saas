import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#7C3AED]/10 p-4">
        <Icon className="h-8 w-8 text-[#7C3AED]" aria-hidden="true" />
      </div>

      <div className="space-y-1">
        <h3 className="text-xl font-semibold text-[#F5F5F5]">{title}</h3>
        <p className="mx-auto max-w-xs text-sm text-[#888888]">{description}</p>
      </div>

      {action ? (
        <Button type="button" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
