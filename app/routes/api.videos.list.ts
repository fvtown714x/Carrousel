import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { requireShopDev } from "../utils/requireShopDev.server";

export const loader = async ({ request }) => {

  const { shop } = await requireShopDev();

  const videos = await prisma.video.findMany({
    where: {
      shopId: shop.id
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const media = videos.map((v) => ({
    id: v.id,
    type: v.type,
    url: v.originalUrl,
    thumbnail: v.thumbnailUrl
  }));

  return Response.json({ media });
};