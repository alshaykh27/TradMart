import "server-only";
import { getMarketingSettings } from "./settings.ts";
import { buildMetaCapiPayload, buildTikTokEventsPayload, type MetaUserData } from "./payloads.ts";
import type { StandardEvent } from "./config.ts";

/**
 * Server-side conversion events: Meta Conversions API and TikTok Events API.
 *
 * These exist for deduplication. The browser pixel fires the same event with
 * the same event id, and the platform collapses the pair into a single
 * conversion. That is why the id is minted once server-side in
 * lib/orders/create.ts and then handed to both senders AND returned to the
 * browser — if the two halves disagree, the merchant gets double-counted
 * conversions instead of a deduplicated one.
 *
 * A platform with no Pixel ID, or no matching access token, is skipped
 * silently. Nothing here throws: a conversion-tracking failure must never fail
 * an order that has already been persisted.
 */

const META_GRAPH_VERSION = "v21.0";
const META_ENDPOINT = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const TIKTOK_ENDPOINT = "https://api.tiktokeventsapi.com/v1.3/event/track/";

/** A mis-typed token or a slow vendor must not hold up the checkout response. */
const REQUEST_TIMEOUT_MS = 4000;

export type ServerEventOutcome = {
  sent: boolean;
  platform: "meta" | "tiktok";
  detail?: string;
};

export type ServerMarketingEvent = {
  eventName: StandardEvent;
  eventId: string;
  eventSourceUrl?: string | null;
  currency?: string | null;
  value?: number | null;
  numItems?: number | null;
  contentIds?: string[] | null;
  contentNames?: string[] | null;
  userData?: MetaUserData;
};

/**
 * Fans one event out to every configured server-side platform. Returns one
 * outcome per platform that was actually attempted; unconfigured platforms are
 * simply absent from the result.
 */
export async function sendServerMarketingEvent(
  event: ServerMarketingEvent,
): Promise<ServerEventOutcome[]> {
  const settings = await getMarketingSettings();
  const eventTime = Math.floor(Date.now() / 1000);
  const results: ServerEventOutcome[] = [];

  if (settings.metaPixelId && settings.metaCapiToken) {
    const url =
      `${META_ENDPOINT}/${encodeURIComponent(settings.metaPixelId)}` +
      `/events?access_token=${encodeURIComponent(settings.metaCapiToken)}`;

    results.push(
      await postJson(
        "meta",
        url,
        buildMetaCapiPayload({
          eventName: event.eventName,
          eventId: event.eventId,
          eventTime,
          eventSourceUrl: event.eventSourceUrl,
          currency: event.currency,
          value: event.value,
          numItems: event.numItems,
          contentIds: event.contentIds,
          userData: event.userData,
        }),
      ),
    );
  }

  if (settings.tiktokPixelId && settings.tiktokApiToken) {
    results.push(
      await postJson(
        "tiktok",
        TIKTOK_ENDPOINT,
        buildTikTokEventsPayload({
          eventName: event.eventName,
          eventId: event.eventId,
          eventTime,
          pixelCode: settings.tiktokPixelId,
          accessToken: settings.tiktokApiToken,
          currency: event.currency,
          value: event.value,
          numItems: event.numItems,
          contentIds: event.contentIds,
          contentNames: event.contentNames,
        }),
      ),
    );
  }

  return results;
}

async function postJson(
  platform: ServerEventOutcome["platform"],
  url: string,
  payload: Record<string, unknown>,
): Promise<ServerEventOutcome> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Log the status code only. The response body can echo the access token
      // back, and this must never end up in a log.
      const detail = `HTTP ${response.status}`;
      console.error(`[marketing] ${platform} server event failed: ${detail}`);
      return { sent: false, platform, detail };
    }

    return { sent: true, platform };
  } catch (error) {
    const detail = error instanceof Error ? error.name : "request-failed";
    console.error(`[marketing] ${platform} server event failed: ${detail}`);
    return { sent: false, platform, detail };
  }
}
