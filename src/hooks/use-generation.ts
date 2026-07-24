"use client";

import { useState, useCallback, useRef } from "react";
import { GENERATION_POLL_INTERVAL_MS } from "@/lib/constants";

type GenerationStatus = "idle" | "submitting" | "processing" | "completed" | "failed";

interface GenerationResult {
  generation_id: string;
  task_id: string;
  credits_used: number;
  balance: number;
  result_url?: string;
  error_message?: string;
}

export function useGeneration() {
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    (generationId: string) => {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/generate/status?id=${generationId}`);
          const data = await res.json();

          if (data.status === "completed") {
            stopPolling();
            setStatus("completed");
            setResult((prev) =>
              prev ? { ...prev, result_url: data.result_url } : null
            );
          } else if (data.status === "failed") {
            stopPolling();
            setStatus("failed");
            setError(data.error_message || "Falha na geração");
          }
        } catch {
          // Continue polling on network errors
        }
      }, GENERATION_POLL_INTERVAL_MS);
    },
    [stopPolling]
  );

  const generate = useCallback(
    async (
      modality: "image" | "video" | "audio",
      params: Record<string, unknown>
    ) => {
      setStatus("submitting");
      setError(null);
      setResult(null);
      stopPolling();

      try {
        const res = await fetch(`/api/generate/${modality}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });

        const data = await res.json();

        if (!res.ok) {
          setStatus("failed");
          setError(data.error || "Erro na geração");
          return null;
        }

        setResult(data);
        setStatus("processing");
        pollStatus(data.generation_id);
        return data;
      } catch (err) {
        setStatus("failed");
        setError(String(err));
        return null;
      }
    },
    [pollStatus, stopPolling]
  );

  const reset = useCallback(() => {
    stopPolling();
    setStatus("idle");
    setResult(null);
    setError(null);
  }, [stopPolling]);

  return {
    status,
    result,
    error,
    generate,
    reset,
    isGenerating: status === "submitting" || status === "processing",
  };
}
