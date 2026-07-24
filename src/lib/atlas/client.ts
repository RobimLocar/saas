// TODO: implementar integração com Atlas
export async function atlasRequest(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ATLAS_API_KEY || ""}`,
      ...(init?.headers || {}),
    },
  });
  return res.json();
}
