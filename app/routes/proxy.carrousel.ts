import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type StorefrontItem = {
  id: string;
  title: string;
  type: "VIDEO" | "IMAGE";
  url: string | null;
  thumbnail: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

function cleanPlaylistName(value: string | null) {
  return (value || "").trim();
}

function mapVideoItem(video: {
  id: string;
  title: string | null;
  type: "VIDEO" | "IMAGE";
  originalUrl: string | null;
  thumbnailUrl: string | null;
}): StorefrontItem {
  return {
    id: video.id,
    title: video.title || "Untitled media",
    type: video.type,
    url: video.originalUrl,
    thumbnail: video.thumbnailUrl || video.originalUrl,
  };
}

async function getDefaultPlaylistVideos(shopId: string, limit: number) {
  const playlist = await prisma.playlist.findFirst({
    where: { shopId },
    orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
    include: {
      videos: {
        orderBy: { position: "asc" },
        take: limit,
        include: {
          video: {
            select: {
              id: true,
              title: true,
              type: true,
              originalUrl: true,
              thumbnailUrl: true,
            },
          },
        },
      },
    },
  });

  return playlist?.videos.map((entry) => mapVideoItem(entry.video)) || [];
}

async function getNamedPlaylistVideos(shopId: string, playlistName: string, limit: number) {
  const playlist = await prisma.playlist.findFirst({
    where: { shopId, name: playlistName },
    include: {
      videos: {
        orderBy: { position: "asc" },
        take: limit,
        include: {
          video: {
            select: {
              id: true,
              title: true,
              type: true,
              originalUrl: true,
              thumbnailUrl: true,
            },
          },
        },
      },
    },
  });

  return playlist?.videos.map((entry) => mapVideoItem(entry.video)) || [];
}

async function getProductTaggedVideos(shopId: string, productId: string, limit: number) {
  const tagged = await prisma.videoProductTag.findMany({
    where: { shopifyProductId: productId, video: { shopId } },
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      video: {
        select: {
          id: true,
          title: true,
          type: true,
          originalUrl: true,
          thumbnailUrl: true,
        },
      },
    },
  });

  return tagged.map((entry) => mapVideoItem(entry.video));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shopDomain = (url.searchParams.get("shop") || "").trim().toLowerCase();
  const source = (url.searchParams.get("source") || "default").trim().toLowerCase();
  const playlistName = cleanPlaylistName(url.searchParams.get("playlist"));
  const productId = (url.searchParams.get("productId") || "").trim();
  const limit = Math.max(1, Math.min(24, Number(url.searchParams.get("limit") || "12")));

  if (!shopDomain) {
    return jsonResponse({ items: [], error: "Missing shop domain." }, 400);
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  if (!shop) {
    return jsonResponse({ items: [], error: "Shop not found." }, 404);
  }

  let items: StorefrontItem[] = [];

  if (source === "product" && productId) {
    items = await getProductTaggedVideos(shop.id, productId, limit);
  }

  if (items.length === 0 && source === "playlist" && playlistName) {
    items = await getNamedPlaylistVideos(shop.id, playlistName, limit);
  }

  if (items.length === 0 && playlistName) {
    items = await getNamedPlaylistVideos(shop.id, playlistName, limit);
  }

  if (items.length === 0) {
    items = await getDefaultPlaylistVideos(shop.id, limit);
  }

  return jsonResponse({
    items,
    source,
    playlist: playlistName || "Default",
    productId: productId || null,
  });
};