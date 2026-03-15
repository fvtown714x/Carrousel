import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { requireShopDev } from "./requireShopDev.server";

export async function requireShop(request: Request) {
  const DEV_MODE = true;
  if (DEV_MODE) return requireShopDev();

  const { session, admin } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  return { session, shop, admin };
}