import { Workflow } from "lucide-react";
import { PagePlaceholder } from "@/components/shared/page-placeholder";

export default function FlowsPage() {
  return (
    <PagePlaceholder
      icon={Workflow}
      title="Flows"
      description="Automatize sequências de geração encadeando prompts, modelos e referências. Em breve (Fase 2)."
    />
  );
}
