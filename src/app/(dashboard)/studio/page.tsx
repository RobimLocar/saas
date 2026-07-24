import { MediaGallery, type MediaItem } from "@/components/studio/media-gallery";
import { GenerationDock } from "@/components/studio/generation-dock";

// Amostra de mídia para a galeria (substituída pelos assets reais do usuário).
const SAMPLE: MediaItem[] = [
  { id: "1", url: "https://cdn.abacus.ai/images/bc3053c4-582d-44c5-8fb3-9ee2af09e1ee.png", alt: "Creator gravando no quarto", height: 300, isVideo: true },
  { id: "2", url: "https://cdn.abacus.ai/images/0b3cbc82-8672-40e9-9eff-15b92b6a8ce3.png", alt: "Creator em home office", height: 380, isVideo: true },
  { id: "3", url: "https://cdn.abacus.ai/images/098653f5-32d5-4ff7-bee3-746b76c09e0a.png", alt: "Creator na cozinha", height: 260 },
  { id: "4", url: "https://cdn.abacus.ai/images/153eb7d6-5293-4205-921b-68910d403511.png", alt: "Creator na cozinha iluminada", height: 340, isVideo: true },
  { id: "5", url: "https://cdn.abacus.ai/images/ceecc9ec-ae8e-473b-9dce-5b0e48f4ca92.png", alt: "Creator na sala de estar", height: 280 },
  { id: "6", url: "https://cdn.abacus.ai/images/ff1263eb-f6f3-4dfd-bc4b-a9b74f90e278.png", alt: "Creator com cabelo afro no quarto", height: 360, isVideo: true },
  { id: "7", url: "https://cdn.abacus.ai/images/2d49bb22-27c1-4cb8-b8eb-8da5c0a70b67.png", alt: "Creator no café", height: 330 },
  { id: "8", url: "https://cdn.abacus.ai/images/1bb4b154-fa07-465b-aeeb-c4492dbcbbd9.png", alt: "Creator em home office", height: 290, isVideo: true },
  { id: "9", url: "https://cdn.abacus.ai/images/5547de09-9b1a-4e66-a565-6a0c9c5828ee.png", alt: "Creator UGC", height: 320 },
  { id: "10", url: "https://cdn.abacus.ai/images/d1549c2b-9541-4549-86ab-0d3fc5ff348a.png", alt: "Creator UGC", height: 280, isVideo: true },
  { id: "11", url: "https://cdn.abacus.ai/images/af122361-4d3d-42e8-9108-2ebdedd92ea4.png", alt: "Creator UGC", height: 350 },
  { id: "12", url: "https://cdn.abacus.ai/images/f1fe3b9f-2cbf-4734-9239-eb71d39f01a5.png", alt: "Creator UGC", height: 300, isVideo: true },
];

export default function StudioPage() {
  return (
    <>
      <MediaGallery items={SAMPLE} />
      <GenerationDock />
    </>
  );
}
