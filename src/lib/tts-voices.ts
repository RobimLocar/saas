// Catálogo de vozes de TTS compartilhado entre o front (voice selector) e o
// back (rota de geração + preview).
//
// MOTOR: Atlas Cloud (api.atlascloud.ai) → modelo `elevenlabs/v3/text-to-speech`.
// Os ids abaixo são exatamente os `voice` aceitos pelo endpoint do Atlas, então
// a voz escolhida no seletor muda o áudio de fato. Cada voz traz uma URL de
// preview hospedada pelo próprio Atlas (usada no botão ▶ sem custo de API).

export type TtsVoice = {
  id: string; // voice id aceito pelo Atlas (ElevenLabs)
  name: string;
  description: string;
  accent: string; // derivado do idioma nativo da voz
  gender: "Female" | "Male";
  age: string;
  language: string; // ISO code (Atlas)
  preview: string; // mp3 de amostra hospedado pelo Atlas
};

const PREVIEW = (slug: string) =>
  `https://static.atlascloud.ai/media/audios/voice_preview_${slug}.mp3`;

export const TTS_VOICES: TtsVoice[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "Warm, professional, soft", accent: "American", gender: "Female", age: "Young", language: "en-US", preview: PREVIEW("sarah") },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", description: "Soft, young, engaging", accent: "American", gender: "Female", age: "Young", language: "en-US", preview: PREVIEW("bella") },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", description: "Playful, expressive, youthful", accent: "American", gender: "Female", age: "Young", language: "en-US", preview: PREVIEW("jessica") },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", description: "Warm, clear, friendly", accent: "American", gender: "Female", age: "Middle Aged", language: "en-US", preview: PREVIEW("lily") },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep, authoritative, versatile", accent: "American", gender: "Male", age: "Middle Aged", language: "en-US", preview: PREVIEW("adam") },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", description: "Confident, easygoing", accent: "American", gender: "Male", age: "Middle Aged", language: "en-US", preview: PREVIEW("roger") },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", description: "Deep, resonant narrator", accent: "American", gender: "Male", age: "Middle Aged", language: "en-US", preview: PREVIEW("brian") },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", description: "Authoritative, deep, news", accent: "American", gender: "Male", age: "Middle Aged", language: "en-US", preview: PREVIEW("daniel") },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris", description: "Casual, natural, down-to-earth", accent: "American", gender: "Male", age: "Middle Aged", language: "en-US", preview: PREVIEW("chris") },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", description: "Intense, gravelly, characterful", accent: "American", gender: "Male", age: "Middle Aged", language: "en-US", preview: PREVIEW("callum") },
  { id: "SOYHLrjzK2X1ezoPC6cr", name: "Harry", description: "Energetic, animated", accent: "American", gender: "Male", age: "Young", language: "en-US", preview: PREVIEW("harry") },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", description: "Trustworthy, mature, calm", accent: "American", gender: "Male", age: "Old", language: "en-US", preview: PREVIEW("bill") },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", description: "Bright, quirky, youthful", accent: "French", gender: "Female", age: "Young", language: "fr", preview: PREVIEW("laura") },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", description: "Smooth, classy, refined", accent: "French", gender: "Male", age: "Middle Aged", language: "fr", preview: PREVIEW("eric") },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", description: "Warm, friendly, pleasant", accent: "Italian", gender: "Female", age: "Young", language: "it", preview: PREVIEW("matilda") },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will", description: "Chill, laid-back, friendly", accent: "Spanish", gender: "Male", age: "Young", language: "es", preview: PREVIEW("will") },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", description: "Articulate, youthful, upbeat", accent: "German", gender: "Male", age: "Young", language: "de", preview: PREVIEW("liam") },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", description: "Casual, natural, confident", accent: "Chinese", gender: "Male", age: "Middle Aged", language: "zh-CN", preview: PREVIEW("charlie") },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River", description: "Calm, neutral, versatile", accent: "Chinese", gender: "Female", age: "Middle Aged", language: "zh-CN", preview: PREVIEW("river") },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", description: "Warm, mature narrator", accent: "Japanese", gender: "Male", age: "Middle Aged", language: "ja", preview: PREVIEW("george") },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", description: "Clear, confident, professional", accent: "Japanese", gender: "Female", age: "Middle Aged", language: "ja", preview: PREVIEW("alice") },
];

export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah

const VALID_IDS = new Set(TTS_VOICES.map((v) => v.id));

/** Valida um voice id contra o catálogo do Atlas (fallback: voz padrão). */
export function resolveAtlasVoice(voiceId?: string | null): string {
  return voiceId && VALID_IDS.has(voiceId) ? voiceId : DEFAULT_VOICE_ID;
}

export function findVoice(voiceId?: string | null): TtsVoice | undefined {
  return TTS_VOICES.find((x) => x.id === voiceId);
}

/** URL de preview (amostra) da voz, se existir. */
export function voicePreviewUrl(voiceId?: string | null): string | undefined {
  return findVoice(voiceId)?.preview;
}
