"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

async function fetchCredits(): Promise<{ credits: number; plan: string }> {
  const res = await fetch("/api/credits");
  if (!res.ok) return { credits: 0, plan: "free" };
  return res.json();
}

export function useCredits() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["credits"],
    queryFn: fetchCredits,
    refetchInterval: 30_000, // Atualizar a cada 30s
    staleTime: 10_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["credits"] });
  };

  return {
    credits: query.data?.credits ?? 0,
    plan: query.data?.plan ?? "free",
    isLoading: query.isLoading,
    refetch: query.refetch,
    invalidate,
  };
}
