// Catálogo de vozes de TTS compartilhado entre o front (voice selector) e o
// back (rota de geração + preview).
//
// MOTOR: Atlas Cloud (api.atlascloud.ai) → modelo `elevenlabs/v3/text-to-speech`.
// Os ids abaixo são voice ids do ElevenLabs (aceitos pelo Atlas). O seletor
// espelha o catálogo premade do concorrente. O botão ▶ toca uma amostra
// hospedada pelo Atlas (sem custo de API) — para as vozes com preview conhecido
// usamos o slug oficial; nas demais tentamos derivar pelo nome.

export type TtsVoice = {
  id: string; // voice id do ElevenLabs (aceito pelo Atlas)
  name: string;
  description: string;
  accent: string;
  gender: "Female" | "Male";
  age: string;
  language: string; // ISO code
  preview: string; // mp3 de amostra
  openai?: string; // legado (não usado pelo motor Atlas)
};

const PREVIEW = (slug: string) =>
  `https://static.atlascloud.ai/media/audios/voice_preview_${slug}.mp3`;

// Slugs de preview confirmados no Atlas (por voice id).
const ATLAS_PREVIEW: Record<string, string> = {
  EXAVITQu4vr4xnSDxMaL: "sarah",
  hpp4J3VqNfWAUOO0d1Us: "bella",
  cgSgspJ2msm6clMCkdW9: "jessica",
  pFZP5JQG7iQjIQuC4Bku: "lily",
  pNInz6obpgDQGcFmaJgB: "adam",
  CwhRBWXzGAHq8TQ4Fs17: "roger",
  nPczCjzI2devNBz1zQrb: "brian",
  onwK4e9ZLuTAKqWW03F9: "daniel",
  iP95p4xoKVk53GoZ742B: "chris",
  N2lVS1w4EtoT3dr4eOWO: "callum",
  SOYHLrjzK2X1ezoPC6cr: "harry",
  pqHfZKP75CvOlQylNhV4: "bill",
  FGY2WhTYpPnrIDTdsKH5: "laura",
  cjVigY5qzO86Huf0OWal: "eric",
  XrExE9yKIg1WjnnlVkGX: "matilda",
  bIHbv24MWmeRgasZH58o: "will",
  TX3LPaxmHKxFdv7VOQHJ: "liam",
  IKne3meq5aSn9XLyUdCD: "charlie",
  SAz9YHcvj6GT2YYXdXww: "river",
  JBFqnCBsd6RMkjVDRZzb: "george",
  Xb7hH8MSUJpSbSDYk0k2: "alice",
};

const LANG_BY_ACCENT: Record<string, string> = {
  American: "en-US",
  British: "en-GB",
  Indian: "en-IN",
  Italian: "it",
  Standard: "en-US",
};

const nameSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

type RawVoice = Omit<TtsVoice, "language" | "preview">;

const RAW_VOICES: RawVoice[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Savannah", description: "Heartfelt, Emotional, Articulate", accent: "British", gender: "Female", age: "Young", openai: "shimmer" },
  { id: "9BWtsMINqrJLrRacOk9x", name: "Amelia", description: "Warm & Natural", accent: "British", gender: "Female", age: "Young", openai: "nova" },
  { id: "jBpfuIE2acCo8z3wKNLl", name: "Velvet Noir", description: "High-End Advertisement", accent: "British", gender: "Female", age: "Middle Aged", openai: "shimmer" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Angela", description: "Conversational and Friendly", accent: "American", gender: "Female", age: "Middle Aged", openai: "nova" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Calm, Approachable", accent: "American", gender: "Female", age: "Young", openai: "nova" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", description: "Strong, Expressive", accent: "American", gender: "Female", age: "Young", openai: "shimmer" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", description: "Emotional, Younger", accent: "American", gender: "Female", age: "Young", openai: "shimmer" },
  { id: "oWAxZDx7w5VEj9dCyTzz", name: "Grace", description: "Gentle, Southern", accent: "American", gender: "Female", age: "Young", openai: "nova" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", description: "Seductive, Confident", accent: "American", gender: "Female", age: "Middle Aged", openai: "shimmer" },
  { id: "z9fAnlkpzviPz146aGWa", name: "Glinda", description: "Warm, Witty", accent: "American", gender: "Female", age: "Middle Aged", openai: "nova" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie Chatlin", description: "Real & Casual", accent: "British", gender: "Male", age: "Middle Aged", openai: "echo" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep, Authoritative", accent: "American", gender: "Male", age: "Middle Aged", openai: "onyx" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Well-rounded, Versatile", accent: "American", gender: "Male", age: "Young", openai: "echo" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Calm, Trustworthy", accent: "American", gender: "Male", age: "Young", openai: "fable" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", description: "Commanding, Confident", accent: "American", gender: "Male", age: "Middle Aged", openai: "onyx" },
  { id: "pMsXgVXv3BLzUgSXRplE", name: "Serena", description: "Pleasant, Conversational", accent: "American", gender: "Female", age: "Middle Aged", openai: "nova" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", description: "Intense, Magnetic", accent: "British", gender: "Male", age: "Middle Aged", openai: "echo" },
  { id: "ODq5zmih8GrVes37Dizd", name: "Patrick", description: "Solid, Trustworthy", accent: "American", gender: "Male", age: "Middle Aged", openai: "onyx" },
  { id: "g5CIjZEefAph4nQFvHAz", name: "Ethan", description: "Soft, Whispery", accent: "American", gender: "Male", age: "Young", openai: "fable" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", description: "Deep, Authoritative", accent: "British", gender: "Male", age: "Middle Aged", openai: "onyx" },
  { id: "flq6f7yk4E4fJM5XTYuZ", name: "Michael", description: "Warm, Calm", accent: "American", gender: "Male", age: "Old", openai: "echo" },
  { id: "D38z5RcWu1voky8WS1ja", name: "Fin", description: "Sailor, Scottish", accent: "British", gender: "Male", age: "Young", openai: "fable" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Viraj", description: "Bold & Commanding Banking Agent", accent: "Indian", gender: "Male", age: "Young", openai: "onyx" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", description: "Confident, British", accent: "British", gender: "Female", age: "Middle Aged", openai: "shimmer" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", description: "Expressive, Forward", accent: "American", gender: "Female", age: "Young", openai: "nova" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", description: "Friendly, Grounded", accent: "American", gender: "Male", age: "Middle Aged", openai: "echo" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", description: "Warm, Authoritative", accent: "British", gender: "Male", age: "Middle Aged", openai: "onyx" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", description: "Articulate, Engaging", accent: "American", gender: "Male", age: "Young", openai: "fable" },
  { id: "piTKgcLEGmPE4e6mEKli", name: "Nicole", description: "Whispery, Intimate", accent: "American", gender: "Female", age: "Young", openai: "nova" },
  { id: "t0jbNlBVZ17f02VDIeMI", name: "Roger", description: "Confident, Assuring", accent: "American", gender: "Male", age: "Middle Aged", openai: "onyx" },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River", description: "Non-binary, Light", accent: "American", gender: "Male", age: "Young", openai: "echo" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", description: "Deep, Engaging", accent: "American", gender: "Male", age: "Middle Aged", openai: "onyx" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will", description: "Friendly, Engaging", accent: "American", gender: "Male", age: "Young", openai: "echo" },
  { id: "oB0KNEsFpXpicSHVIHVX", name: "Harry", description: "Angsty, Young", accent: "British", gender: "Male", age: "Young", openai: "fable" },
  { id: "GBv7mTt0atIp3Br8iCZE", name: "Thomas", description: "Calm, Peaceful", accent: "British", gender: "Male", age: "Young", openai: "fable" },
  { id: "Zlb1dXrM653N07WRdFW3", name: "Joseph", description: "Mature, Wise", accent: "American", gender: "Male", age: "Old", openai: "onyx" },
  { id: "zcAOhNBS3c14rBihAFp1", name: "Giovanni", description: "Focused, Italian", accent: "Italian", gender: "Male", age: "Young", openai: "fable" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", description: "Raspy, Uncompromising", accent: "American", gender: "Male", age: "Young", openai: "echo" },
];

export const TTS_VOICES: TtsVoice[] = RAW_VOICES.map((v) => ({
  ...v,
  language: LANG_BY_ACCENT[v.accent] || "en-US",
  preview: PREVIEW(ATLAS_PREVIEW[v.id] || nameSlug(v.name)),
}));

export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Savannah

const VALID_IDS = new Set(TTS_VOICES.map((v) => v.id));

/** Valida um voice id contra o catálogo (fallback: voz padrão). */
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


/**
 * Mapeamento de sotaque (string do modal) para voice id ElevenLabs.
 * "Accent" = padrão (Savannah); Sotaques dedicados usam a voz mais fiel.
 * Sotaques sem voz dedicada em inglês usam a voz com timbre mais adequado.
 */
const ACCENT_TO_VOICE: Record<string, string> = {
  Accent:   "EXAVITQu4vr4xnSDxMaL", // Savannah — padrão neutro
  Irish:    "JBFqnCBsd6RMkjVDRZzb", // George — warmly authoritative
  Scottish: "D38z5RcWu1voky8WS1ja", // Fin — "Sailor, Scottish"
  French:   "9BWtsMINqrJLrRacOk9x", // Amelia — suave e continental
  German:   "N2lVS1w4EtoT3dr4eOWO", // Callum — intenso e preciso
  Spanish:  "oWAxZDx7w5VEj9dCyTzz", // Grace — caloroso
  Italian:  "zcAOhNBS3c14rBihAFp1", // Giovanni — "Focused, Italian"
};

export function mapAccentToVoice(accent: string): string {
  return ACCENT_TO_VOICE[accent] ?? DEFAULT_VOICE_ID;
}
