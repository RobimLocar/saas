import { Copy } from "lucide-react";
import { PagePlaceholder } from "@/components/shared/page-placeholder";

export default function MyPromptsPage() {
  return (
    <PagePlaceholder
      icon={Copy}
      title="My Prompts"
      description="Salve seus melhores prompts e reutilize com um clique. Em breve (Fase 2)."
    />
  );
}
