import "server-only";

/**
 * Safka environment access with validation.
 *
 * Both values are secrets and must only ever be read from server-side code.
 */

export function getSafkaEnv() {
  const baseUrl = process.env.SAFKA_API_BASE_URL;
  const apiKey = process.env.SAFKA_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Missing SAFKA_API_BASE_URL or SAFKA_API_KEY. Add them to .env.local.",
    );
  }

  return { baseUrl, apiKey };
}