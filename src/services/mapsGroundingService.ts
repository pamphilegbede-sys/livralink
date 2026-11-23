import { auth } from '../firebase/config';
import type { MapsGroundingContext, MapsGroundingResult } from '../types';

export interface SearchMapsGroundingInput {
  query: string;
  commune?: string;
  context?: MapsGroundingContext;
  latitude?: number;
  longitude?: number;
}

export interface SearchMapsGroundingResponse {
  success: boolean;
  result?: MapsGroundingResult;
  code?: string;
  error?: string;
}

export async function searchMapsGrounding(
  input: SearchMapsGroundingInput,
  options?: { timeoutMs?: number }
): Promise<SearchMapsGroundingResponse> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return {
      success: false,
      code: 'UNAUTHENTICATED',
      error: 'Connectez-vous avec votre compte vérifié pour utiliser la vérification Google Maps IA.',
    };
  }

  let token = '';
  try {
    token = await currentUser.getIdToken();
  } catch {
    return {
      success: false,
      code: 'TOKEN_ERROR',
      error: 'Impossible de vérifier votre session Firebase.',
    };
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 28_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('/api/maps/grounding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: input.query,
        commune: input.commune,
        context: input.context || 'general',
        latitude: input.latitude,
        longitude: input.longitude,
      }),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as SearchMapsGroundingResponse;
    if (!res.ok || !data?.success || !data.result) {
      return {
        success: false,
        code: data?.code || `HTTP_${res.status}`,
        error: data?.error || 'Impossible de contacter le service Google Maps IA pour le moment.',
      };
    }

    return data;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        success: false,
        code: 'TIMEOUT',
        error: 'La recherche Google Maps IA a expiré. Réessayez dans un instant.',
      };
    }
    return {
      success: false,
      code: 'NETWORK_ERROR',
      error: 'Erreur réseau lors de la vérification Google Maps.',
    };
  } finally {
    clearTimeout(timer);
  }
}
