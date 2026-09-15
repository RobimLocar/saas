import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GenerationCardProps {
  status: "processing" | "completed" | "failed";
  label: string;
  result_url?: string;
  onRetry?: () => void;
  progress?: number;
  estimatedTime?: string;
  className?: string;
  mediaType?: "image" | "video";
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
}

export function GenerationCard({
  status,
  label,
  result_url,
  onRetry,
  progress,
  estimatedTime,
  className,
  mediaType,
}: GenerationCardProps) {
  if (status === "processing") {
    return (
      <article
        className={cn(
          "relative overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#141414] p-4",
          className
        )}
      >
        <div className="pointer-events-none absolute inset-0 premium-shimmer opacity-55" />
        <div className="relative flex min-h-36 flex-col items-center justify-center text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#A78BFA]" />
          <p className="mt-3 text-sm font-medium text-[#F5F5F5]">{label}</p>
          <p className="mt-1 text-xs text-[#888888]">
            Gerando… {estimatedTime ? estimatedTime : "~1–3 min"}
          </p>

          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#2A2A2A]">
            {typeof progress === "number" ? (
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A78BFA] transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            ) : (
              <div className="premium-progress-indeterminate h-full w-1/2 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A78BFA]" />
            )}
          </div>
        </div>
      </article>
    );
  }

  if (status === "failed") {
    return (
      <article
        className={cn(
          "rounded-2xl border border-[#3A1F1F] bg-[#1A1414] p-4",
          className
        )}
      >
        <div className="flex min-h-36 flex-col items-center justify-center text-center">
          <AlertTriangle className="h-6 w-6 text-[#FCA5A5]" />
          <p className="mt-3 text-sm font-medium text-[#F5F5F5]">Falha na geração</p>
          <p className="mt-1 text-xs text-[#A68D8D]">{label}</p>
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              className="mt-4 border-[#4A2A2A] text-[#FCA5A5] hover:bg-[#2A1515]"
              onClick={onRetry}
            >
              Tentar de novo
            </Button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "animate-premium-fade-in overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#141414] ring-1 ring-white/5",
        className
      )}
    >
      {result_url ? (
        mediaType === "video" || isVideoUrl(result_url) ? (
          <video
            src={result_url}
            autoPlay
            muted
            loop
            playsInline
            controls={false}
            className="h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result_url} alt={label} className="h-full w-full object-cover" />
        )
      ) : (
        <div className="flex min-h-36 items-center justify-center text-xs text-[#888888]">
          Sem mídia
        </div>
      )}
    </article>
  );
}
