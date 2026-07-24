// Presets do painel "Assist" — trechos que são anexados ao prompt.
// Inspirado no fluxo de construção de prompt do vídeo de referência.

export interface AssistCategory {
  id: string;
  label: string;
  options: string[];
}

export const ASSIST_CATEGORIES: AssistCategory[] = [
  {
    id: "subject",
    label: "Sujeito",
    options: [
      "modelo fashion feminina",
      "modelo fashion masculino",
      "influenciador de lifestyle",
      "criador de conteúdo UGC",
      "influenciadora de beleza",
      "influenciador fitness",
      "modelo de marca de luxo",
      "modelo de campanha comercial",
      "modelo editorial de alta-costura",
      "criador de mídia social",
    ],
  },
  {
    id: "style",
    label: "Estilo",
    options: [
      "fotorrealista",
      "cinematográfico",
      "arte digital",
      "aquarela",
      "pintura a óleo",
      "estilo anime",
      "renderização 3D",
      "cyberpunk",
      "minimalista",
      "vintage retrô",
    ],
  },
  {
    id: "lighting",
    label: "Iluminação",
    options: [
      "luz de hora dourada",
      "luz suave difusa",
      "iluminação dramática de estúdio",
      "luz neon",
      "contraluz",
      "luz natural de janela",
      "iluminação cinematográfica",
      "penumbra ao entardecer",
    ],
  },
  {
    id: "camera_lens",
    label: "Lente",
    options: [
      "lente grande-angular natural 35mm",
      "retrato 85mm",
      "macro",
      "olho de peixe",
      "teleobjetiva 200mm",
      "lente anamórfica",
    ],
  },
  {
    id: "camera_movement",
    label: "Movimento de câmera",
    options: [
      "câmera estática",
      "travelling lento",
      "movimento orbital",
      "dolly zoom",
      "câmera na mão",
      "plano aéreo com drone",
    ],
  },
  {
    id: "environment",
    label: "Ambiente",
    options: [
      "interior de banheiro de mármore",
      "cenário urbano ao pôr do sol",
      "floresta enevoada",
      "estúdio minimalista",
      "praia tropical",
      "café aconchegante",
      "deserto ao amanhecer",
      "cidade futurista com neon",
    ],
  },
  {
    id: "mood",
    label: "Atmosfera",
    options: [
      "energética e vibrante",
      "calma e serena",
      "misteriosa e sombria",
      "luxuosa e elegante",
      "nostálgica",
      "épica e grandiosa",
    ],
  },
];
