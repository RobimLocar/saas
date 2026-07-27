export interface ContentPreset {
  key: string;
  label: string;
  icon: string;
  scenes: string[];
}

export const CONTENT_PRESETS: ContentPreset[] = [
  {
    key: "daily_aesthetic",
    label: "Daily Aesthetic",
    icon: "✨",
    scenes: [
      "hallway walking over shoulder, oversized flannel, apartment corridor, natural light",
      "vinyl records floor chill, cozy lounge, warm lamp",
      "morning routine, bathroom vanity, soft glow, skincare routine",
      "reading a book on a window ledge, golden afternoon light, cozy sweater",
      "making tea in a minimalist kitchen, steam rising, calm morning",
      "working at a desk, laptop glow, aesthetic desk setup, focused",
      "sitting cross-legged on a bed, journaling, fairy lights in background",
      "standing by a tall window, city view, soft robe, contemplative mood",
      "folding laundry, white linen, bright airy room, domestic calm",
    ],
  },
  {
    key: "product_placement",
    label: "Product Placement",
    icon: "🛍️",
    scenes: [
      "holding a skincare product to camera, soft daylight, review vibe",
      "product flat lay beside coffee, lifestyle aesthetic",
      "unboxing a new product, excitement, hands on table",
      "showing a supplement bottle, gym background, natural hold",
      "placing a beauty product on a vanity, mirror reflection",
      "holding up a book or journal, cozy reading nook",
      "sipping from a branded cup, cafe setting, candid moment",
      "examining a product label, close-up hands, soft focus background",
      "product in use — applying skincare, close-up skin, soft bokeh",
    ],
  },
  {
    key: "mirror_selfie",
    label: "Mirror Selfie",
    icon: "🪞",
    scenes: [
      "bathroom mirror selfie, casual outfit, phone in hand",
      "full-body bedroom mirror selfie, aesthetic",
      "gym mirror selfie, athletic wear, post-workout",
      "hotel mirror selfie, travel outfit, suitcase in background",
      "fitting room mirror selfie, new outfit try-on, playful",
      "vintage mirror selfie, retro aesthetic, film grain feel",
      "floor-length mirror, elegant dress, bedroom setting",
      "sunlit bathroom mirror, morning glow, fresh face",
    ],
  },
  {
    key: "life_content",
    label: "Life Content",
    icon: "🌿",
    scenes: [
      "sipping coffee at a cafe, candid, morning light",
      "walking a dog in the park, golden hour",
      "farmers market, colorful produce, casual weekend outfit",
      "picnic in a park, blanket on grass, natural surroundings",
      "browsing a bookstore, absorbed in reading, relaxed",
      "cooking at home, kitchen, apron, genuine moment",
      "laughing with a friend, candid street shot, sunny day",
      "driving with window down, hair flowing, road trip vibes",
      "watching sunset from a hill or rooftop, peaceful, silhouette",
    ],
  },
  {
    key: "luxury",
    label: "Luxury",
    icon: "💎",
    scenes: [
      "elegant evening dress, upscale restaurant, ambient light",
      "luxury hotel balcony, city view, silk robe",
      "first-class airport lounge, travel chic, minimalist luggage",
      "high-end spa, robe and towel, cucumber water, serene",
      "art gallery opening, wine glass, sophisticated crowd",
      "champagne toast, penthouse party, skyline background",
      "luxury car interior, editorial pose, leather seats",
      "designer shopping bags, boutique exterior, sunglasses, confident",
      "yacht deck, ocean backdrop, white linen outfit",
    ],
  },
  {
    key: "fitness",
    label: "Fitness",
    icon: "💪",
    scenes: [
      "gym workout, athletic wear, dynamic pose",
      "post-workout smoothie, bright, sporty",
      "outdoor run, sunrise, energetic stride",
      "yoga on a mat, peaceful studio, natural light",
      "lifting weights, gym background, focused expression",
      "stretching in the park, morning dew, calm and fit",
      "cycling outdoors, open road, athletic gear",
      "boxing training, gloves up, intense, gym setting",
      "pool swimming, athletic, clear water, motion blur",
    ],
  },
  {
    key: "scroll_stopper",
    label: "Scroll Stopper",
    icon: "🔥",
    scenes: [
      "bold streetwear, urban graffiti wall, confident",
      "dramatic close-up, striking makeup, high contrast",
      "editorial fashion, abstract background, avant-garde pose",
      "split lighting portrait, half shadow half bright, intense gaze",
      "jumping in a colorful confetti burst, joyful, vibrant",
      "standing in the rain, soaking wet, dramatic, editorial",
      "wind machine hair, studio shoot, powerful stance",
      "neon sign glow, dark background, vibrant hues, moody cool",
    ],
  },
  {
    key: "night_out",
    label: "Night Out",
    icon: "🌙",
    scenes: [
      "night city lights, party outfit, neon bokeh",
      "rooftop bar at night, cocktail, moody",
      "dancing in a club, strobe lights, euphoric",
      "dressed up for dinner, elegant restaurant, soft candlelight",
      "after-party in a cab, window lights passing, night energy",
      "outdoor concert, crowd, stage lights, excitement",
      "walking in high heels on wet night streets, reflections",
      "cocktail bar, close-up of drink, hand holding glass, neon background",
    ],
  },
];

export function buildContentPrompt(persona: string, scene: string): string {
  return `ultra-realistic photo of ${persona}, ${scene}. photorealistic, high detail.`;
}

export function buildPersonaDescription(influencer: {
  age_range?: string | null;
  gender?: string | null;
  hair_color?: string | null;
  eye_color?: string | null;
  styles?: string[] | null;
  additional_details?: string | null;
}): string {
  const parts = [
    influencer.age_range,
    influencer.gender,
    influencer.hair_color ? `${influencer.hair_color} hair` : null,
    influencer.eye_color ? `${influencer.eye_color} eyes` : null,
    influencer.styles?.length ? `${influencer.styles.join("/")} style` : null,
    influencer.additional_details || null,
  ].filter(Boolean);
  return parts.join(", ");
}

export function pickRandomScene(preset: ContentPreset): string {
  return preset.scenes[Math.floor(Math.random() * preset.scenes.length)];
}
