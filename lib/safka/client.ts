import "server-only";
import type { SafkaProductDetail, SafkaProductList } from "@/types/safka";
import { getSafkaEnv } from "./env";

export interface SafkaListParams {
  page?: number;
  size?: number;
  query?: string;
}

/**
 * Server-only Safka Public API client.
 *
 * The Safka API key is a secret and this module imports "server-only", so any
 * attempt to use it from a Client Component fails at build time and the key
 * can never reach the browser.
 */
export function createSafkaClient() {
  const { baseUrl, apiKey } = getSafkaEnv();

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "api-safka-key": apiKey,
        Accept: "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Safka API ${response.status} error for ${path}`);
    }

    return (await response.json()) as T;
  }

  return {
    listProducts(params: SafkaListParams = {}): Promise<SafkaProductList> {
      const query = new URLSearchParams();
      if (params.page) query.set("page", String(params.page));
      if (params.size) query.set("size", String(params.size));
      if (params.query) query.set("query", params.query);
      const qs = query.toString();
      return request<SafkaProductList>(
        `/api/v1/public/products${qs ? `?${qs}` : ""}`,
      );
    },

    getProduct(id: string): Promise<SafkaProductDetail> {
      return request<SafkaProductDetail>(`/api/v1/public/product/${id}`);
    },
  };
}