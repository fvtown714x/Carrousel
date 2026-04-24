import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function toProductGid(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("gid://shopify/Product/")) return raw;
  return `gid://shopify/Product/${raw}`;
}

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const orderId = payload?.id ? String(payload.id) : null;
  const cartToken = payload?.cart_token ? String(payload.cart_token) : null;
  const revenue = Number(payload?.current_total_price || 0);
  const currency = payload?.currency ? String(payload.currency) : null;

  if (!orderId || !cartToken) {
    return new Response();
  }

  const shopRecord = await prisma.shop.findUnique({
    where: { shopDomain: shop },
    select: { id: true },
  });

  if (!shopRecord) {
    return new Response();
  }

  const existing = await prisma.videoInteractionEvent.findFirst({
    where: {
      shopId: shopRecord.id,
      eventType: "ORDER_ATTRIBUTED",
      orderId,
    },
    select: { id: true },
  });

  if (existing) {
    return new Response();
  }

  const sourceEvents = await prisma.videoInteractionEvent.findMany({
    where: {
      shopId: shopRecord.id,
      cartToken,
      eventType: {
        in: ["PLAY", "TAG_TAP", "ADD_TO_CART"],
      },
    },
    select: {
      videoId: true,
      sessionId: true,
      playlistId: true,
      playlistName: true,
      productId: true,
    },
  });

  if (sourceEvents.length === 0) {
    return new Response();
  }

  const sessionId = sourceEvents[0]?.sessionId || `order_${orderId}`;
  const touchedVideoIds = Array.from(new Set(sourceEvents.map((event) => event.videoId).filter(Boolean)));
  const touchedProductIds = Array.from(
    new Set(
      sourceEvents
        .map((event) => event.productId)
        .filter(Boolean)
        .map((productId) => toProductGid(productId)),
    ),
  );

  const lineItems = Array.isArray(payload?.line_items) ? payload.line_items : [];
  for (const item of lineItems) {
    const productGid = toProductGid(item?.product_id);
    if (productGid) {
      touchedProductIds.push(productGid);
    }
  }

  const uniqueProductIds = Array.from(new Set(touchedProductIds));
  const revenuePerVideo = touchedVideoIds.length > 0 ? revenue / touchedVideoIds.length : revenue;
  const revenuePerProduct = uniqueProductIds.length > 0 ? revenue / uniqueProductIds.length : revenue;

  const rows = [];

  for (const videoId of touchedVideoIds) {
    rows.push({
      shopId: shopRecord.id,
      videoId,
      eventType: "ORDER_ATTRIBUTED",
      sessionId,
      cartToken,
      orderId,
      metadata: {
        source: "orders/create",
        currency,
        orderRevenue: revenue,
        attributedRevenue: revenuePerVideo,
      },
    });
  }

  for (const productId of uniqueProductIds) {
    rows.push({
      shopId: shopRecord.id,
      eventType: "ORDER_ATTRIBUTED",
      sessionId,
      cartToken,
      productId,
      orderId,
      metadata: {
        source: "orders/create",
        currency,
        orderRevenue: revenue,
        attributedRevenue: revenuePerProduct,
      },
    });
  }

  if (rows.length > 0) {
    await prisma.videoInteractionEvent.createMany({ data: rows });
  }

  return new Response();
};
