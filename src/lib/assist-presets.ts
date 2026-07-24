// Presets do painel "Assist" — trechos anexados ao prompt ao clicar.
// Categorias e itens replicando o design de referência (screenshots do usuário).

export interface AssistCategory {
  id: string;
  label: string;
  options: string[];
}

export const ASSIST_CATEGORIES: AssistCategory[] = [
  {
    id: "subject",
    label: "Subject",
    options: [
      "Female fashion model",
      "Male fashion model",
      "Lifestyle influencer",
      "UGC content creator",
      "Beauty influencer",
      "Fitness influencer",
      "Luxury brand model",
      "Commercial campaign model",
      "High-fashion editorial model",
      "Social media creator",
    ],
  },
  {
    id: "texture",
    label: "Texture",
    options: [
      "Soft skin texture",
      "Film grain",
      "Glossy surfaces",
      "Matte finish",
      "Velvet fabric detail",
      "Polished marble",
      "Brushed metal",
      "Natural linen weave",
    ],
  },
  {
    id: "style",
    label: "Style",
    options: [
      "Photorealistic",
      "Cinematic",
      "Editorial photography",
      "Digital art",
      "Watercolor",
      "Oil painting",
      "Anime style",
      "3D render",
      "Cyberpunk",
      "Minimalist",
      "Retro vintage",
    ],
  },
  {
    id: "intent",
    label: "Intent",
    options: [
      "Product showcase",
      "Brand storytelling",
      "Social media ad",
      "Behind the scenes",
      "Tutorial demonstration",
      "Unboxing moment",
      "Testimonial vibe",
    ],
  },
  {
    id: "camera_lens",
    label: "Camera Lens",
    options: [
      "35mm natural wide lens",
      "85mm portrait lens",
      "Macro lens",
      "Fisheye lens",
      "200mm telephoto",
      "Anamorphic lens",
    ],
  },
  {
    id: "camera",
    label: "Camera",
    options: [
      "Shot on ARRI Alexa",
      "Shot on RED Komodo",
      "Shot on iPhone, candid",
      "DSLR photography",
      "Vintage 16mm film camera",
      "GoPro POV",
    ],
  },
  {
    id: "camera_movement",
    label: "Camera Movement",
    options: [
      "Static camera",
      "Slow dolly in",
      "Orbit movement",
      "Dolly zoom",
      "Handheld camera",
      "Drone aerial shot",
      "Gentle tracking shot",
    ],
  },
  {
    id: "environment",
    label: "Environment",
    options: [
      "Marble bathroom interior",
      "Urban street at sunset",
      "Misty forest",
      "Minimalist studio",
      "Tropical beach",
      "Cozy coffee shop",
      "Desert at dawn",
      "Neon futuristic city",
    ],
  },
  {
    id: "lighting",
    label: "Lighting",
    options: [
      "Golden hour light",
      "Soft diffused light",
      "Dramatic studio lighting",
      "Neon glow",
      "Backlight silhouette",
      "Natural window light",
      "Cinematic lighting",
      "Dusky twilight",
    ],
  },
];
