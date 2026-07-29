import { cn } from "@/lib/utils";

/** Marca Fluxyra — o "F" oficial (imagem transparente da identidade). */
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/fluxyra-mark.png"
      alt="Fluxyra"
      className={cn("object-contain", className)}
    />
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
