import prisma from "../db.server";

export async function requireShopDev() {
  const shopDomain = "dev-shop.myshopify.com";

  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopDomain,
        accessToken: "dev-token",   // ✅ token fake
      },
    });
  }

  return {
    shop,
    session: { shop: shopDomain },
    admin: null,
  };
}