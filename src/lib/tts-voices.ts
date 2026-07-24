// Catálogo de vozes de TTS compartilhado entre o front (voice selector) e o
// back (rota de geração + preview).
//
// NOTA DE ENGENHARIA: a PiAPI NÃO integra ElevenLabs (retorna "invalid model")
// e o RouteLLM da Abacus lista "elevenlabs" mas o rejeita em /chat/completions.
// O único motor de TTS acessível sem chave nova é o gpt-4o-audio da Abacus,
// cujas vozes OpenAI são alloy/echo/fable/onyx/nova/shimmer. Mantemos os nomes
// de voz definidos no design e mapeamos cada um para a voz OpenAI de timbre mais
// próximo em `openai`. É esse valor que efetivamente muda o áudio gerado.

export type TtsVoice = {
  id: string; // id de exibição (compatível com o design original)
  name: string;
  description: string;
  accent: string;
  gender: "Female" | "Male";
  age: string;
  openai: string; // voz OpenAI real usada na geração/preview
};

export const TTS_VOICES: TtsVoice[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Savannah", description: "Heartfelt, Emotional, Articulate", accent: "British", gender: "Female", age: "Young", openai: "shimmer" },
  { id: "9BWtsMINqrJLrRacOk9x", name: "Amelia", description: "Warm & Natural", accent: "British", gender: "Female", age: "Young", openai: "nova" },
  { id: "jBpfuIE2acCo8z3wKNLl", name: "Velvet Noir", description: "High-End Advertisement", accent: "British", gender: "Female", age: "Middle Aged", openai: "shimmer" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Angela", description: "Conversational and Friendly", accent: "American", gender: "Female", age: "Middle Aged", openai: "nova" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie Chatlin", description: "Real & Casual", accent: "Standard", gender: "Male", age: "Middle Aged", openai: "echo" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Viraj", description: "Bold & Commanding Banking Agent", accent: "Indian", gender: "Male", age: "Young", openai: "onyx" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep, Authoritative", accent: "American", gender: "Male", age: "Middle Aged", openai: "onyx" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Well-rounded, Versatile", accent: "American", gender: "Male", age: "Young", openai: "echo" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Calm, Approachable", accent: "American", gender: "Female", age: "Young", openai: "nova" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", description: "Strong, Expressive", accent: "American", gender: "Female", age: "Young", openai: "shimmer" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", description: "Emotional, Younger", accent: "American", gender: "Female", age: "Young", openai: "shimmer" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Calm, Trustworthy", accent: "American", gender: "Male", age: "Young", openai: "fable" },
];

export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Savannah

const VALID_OPENAI = new Set([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);

/** Resolve um id de voz de exibição para a voz OpenAI real (fallback: alloy). */
export function resolveOpenAiVoice(voiceId?: string | null): string {
  const v = TTS_VOICES.find((x) => x.id === voiceId);
  if (v && VALID_OPENAI.has(v.openai)) return v.openai;
  return "alloy";
}

export function findVoice(voiceId?: string | null): TtsVoice | undefined {
  return TTS_VOICES.find((x) => x.id === voiceId);
}
