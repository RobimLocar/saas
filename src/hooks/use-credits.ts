import { useQuery } from "@tanstack/react-query";

// TODO: implementar busca real de créditos
export function useCredits() {
  return useQuery({
    queryKey: ["credits"],
    queryFn: async () => {
      const res = await fetch("/api/credits");
      return res.json();
    },
  });
}
