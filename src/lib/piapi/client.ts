const PIAPI_BASE_URL = "https://api.piapi.ai";

// TODO: implementar chamadas de geração multimodal via PiAPI
export async function piapiRequest(path: string, init?: RequestInit) {
  const res = await fetch(`${PIAPI_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.PIAPI_API_KEY || "",
      ...(init?.headers || {}),
    },
  });
  return res.json();
}
