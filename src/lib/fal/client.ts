// fal.ai — provedor de redundância (§3.2). Failover roteável por modelo e
// referência para auditar o preço da PiAPI.
const FAL_BASE_URL = "https://fal.run";

// TODO: implementar chamadas de geração via fal.ai (failover da PiAPI).
export async function falRequest(path: string, init?: RequestInit) {
  const res = await fetch(`${FAL_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${process.env.FAL_API_KEY || ""}`,
      ...(init?.headers || {}),
    },
  });
  return res.json();
}
