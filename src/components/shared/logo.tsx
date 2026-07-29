import { cn } from "@/lib/utils";

/** Marca Fluxyra — "F" em gradiente roxo (vetor, escala sem perder nitidez). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="fluxyra-mark"
          x1="24"
          y1="8"
          x2="76"
          y2="94"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#A374FF" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <path
        d="M34 12 h44 a5 5 0 0 1 5 5 v3 a5 5 0 0 1 -5 5 H50 v12 h20 a5 5 0 0 1 5 5 v3 a5 5 0 0 1 -5 5 H50 v28 a5 5 0 0 1 -5 5 h-6 a5 5 0 0 1 -5 -5 V17 a5 5 0 0 1 5 -5 z"
        fill="url(#fluxyra-mark)"
      />
    </svg>
  );
}

export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-8 w-8" />
      {showText && (
        <span className="text-lg font-bold tracking-tight text-foreground">
          Fluxyra
        </span>
      )}
    </div>
  );
}
