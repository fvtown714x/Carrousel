import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const EVENT_TYPE_MAP = {
  play: "PLAY",
  tag_tap: "TAG_TAP",
  add_to_cart: "ADD_TO_CART",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const proxyContext = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shopDomain = (proxyContext.session?.shop || url.searchParams.get("shop") || "").trim().toLowerCase();

  if (!shopDomain) {
    return json({ ok: false, error: "Missing shop domain" }, 400);
  }

  const payload = await request.json().catch(() => null);
  const incomingType = String(payload?.eventType || "").trim().toLowerCase();
  const eventType = EVENT_TYPE_MAP[incomingType as keyof typeof EVENT_TYPE_MAP];

  if (!eventType) {
    return json({ ok: false, error: "Invalid event type" }, 400);
  }

  const sessionId = String(payload?.sessionId || "").trim();
  if (!sessionId) {
    return json({ ok: false, error: "Missing sessionId" }, 400);
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  if (!shop) {
    return json({ ok: false, error: "Shop not found" }, 404);
  }

  const videoId = typeof payload?.videoId === "string" ? payload.videoId : null;
  const cartToken = typeof payload?.cartToken === "string" && payload.cartToken.trim() ? payload.cartToken.trim() : null;
  const playlistId = typeof payload?.playlistId === "string" && payload.playlistId.trim() ? payload.playlistId.trim() : null;
  const playlistName = typeof payload?.playlistName === "string" && payload.playlistName.trim() ? payload.playlistName.trim() : null;
  const productId = typeof payload?.productId === "string" && payload.productId.trim() ? payload.productId.trim() : null;

  try {
    await prisma.videoInteractionEvent.create({
      data: {
        shopId: shop.id,
        videoId,
        eventType,
        sessionId,
        cartToken,
        playlistId,
        playlistName,
        productId,
        metadata:
          payload && typeof payload === "object"
            ? {
                source: payload.source ?? null,
                userAgent: request.headers.get("user-agent"),
              }
            : undefined,
      },
    });
  } catch (error) {
    console.warn("[carrousel.track] failed to persist interaction", error);
    return json({ ok: false, error: "Tracking unavailable" }, 500);
  }

  return json({ ok: true });
};
