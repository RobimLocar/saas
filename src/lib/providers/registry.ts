// Fundação multi-provider (P1) — registry de adapters + resolução de oferta.
// Os clients NÃO foram movidos (adapters começam ausentes); as ofertas começam
// vazias (serão alimentadas pelo catálogo em commits futuros). Zero impacto.

import {
  type Provider,
  type ProviderId,
  type ProviderOffer,
  type ResolveOfferInput,
} from "./types";

// Re-export para consumo direto a partir do registry.
export type { ProviderSelectionPolicy } from "./types";

// ── Adapters ────────────────────────────────────────────────────────────────
const providers = new Map<ProviderId, Provider>();

/** Registra (ou substitui) o adapter de um provider (usado em P2/P3). */
export function registerProvider(adapter: Provider): void {
  providers.set(adapter.id, adapter);
}

/** Retorna o adapter do provider; lança se ainda não registrado. */
export function getProvider(providerId: ProviderId): Provider {
  const adapter = providers.get(providerId);
  if (!adapter) {
    throw new Error(`Provider adapter not registered: "${providerId}"`);
  }
  return adapter;
}

/** Lista os ids de provider já registrados. */
export function listProviderIds(): ProviderId[] {
  return Array.from(providers.keys());
}

// ── Ofertas por modelo canônico ──────────────────────────────────────────────
const offers: ProviderOffer[] = [];

/** Registra uma oferta de um modelo canônico por um provider (futuro: catálogo). */
export function registerOffer(offer: ProviderOffer): void {
  offers.push(offer);
}

/** Lista as ofertas de um modelo canônico. */
export function listOffers(canonicalId: string): ProviderOffer[] {
  return offers.filter((o) => o.canonicalId === canonicalId);
}

/**
 * Resolve qual oferta usar para um modelo canônico segundo a política.
 * Estrutura pronta para uso; ainda NÃO busca banco nem escolhe provider real.
 * - "priority": menor `priority` (default 0).
 * - "cheapest": menor `pricePerSecond` definido.
 * - "manual": não escolhe automaticamente (retorna null).
 * Retorna null quando não há ofertas ou a política não permite escolha automática.
 */
export function resolveProviderOffer(input: ResolveOfferInput): ProviderOffer | null {
  const { canonicalId, policy } = input;
  const candidates = listOffers(canonicalId);
  if (candidates.length === 0) return null;
  if (policy === "manual") return null;
  if (policy === "cheapest") {
    const priced = candidates.filter((o) => typeof o.pricePerSecond === "number");
    const pool = priced.length > 0 ? priced : candidates;
    return pool.reduce((best, o) =>
      (o.pricePerSecond ?? Infinity) < (best.pricePerSecond ?? Infinity) ? o : best
    );
  }
  // "priority"
  return candidates.reduce((best, o) =>
    (o.priority ?? 0) < (best.priority ?? 0) ? o : best
  );
}
