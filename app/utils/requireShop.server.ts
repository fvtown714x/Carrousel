import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { requireShopDev } from "./requireShopDev.server";

export async function requireShop(request: Request) {
  try {
    const { session, admin } = await authenticate.admin(request);

    const shop = await prisma.shop.upsert({
      where: { shopDomain: session.shop },
      update: {
        accessToken: session.accessToken,
        uninstalledAt: null,
      },
      create: {
        shopDomain: session.shop,
        accessToken: session.accessToken,
      },
    });

    return { session, shop, admin };
  } catch (error) {
    console.warn("[requireShop] authenticate.admin failed, using dev fallback", error);
    return requireShopDev();
  }
}