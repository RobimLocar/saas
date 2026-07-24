import { Folder } from "lucide-react";
import { PagePlaceholder } from "@/components/shared/page-placeholder";

export default function AssetsPage() {
  return (
    <PagePlaceholder
      icon={Folder}
      title="Assets"
      description="Toda a mídia que você gerar fica organizada aqui — imagens, vídeos e áudios prontos para baixar."
    />
  );
}
