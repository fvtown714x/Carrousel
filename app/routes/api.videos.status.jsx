import { data } from "react-router";
import prisma from "../db.server";
import { getStreamStatus } from "../services/cloudflare.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const videoId = url.searchParams.get("id");

  const video = await prisma.video.findUnique({
    where: { id: videoId },
  });

  if (!video) {
    return data({ error: "Not found" }, { status: 404 });
  }

  const status = await getStreamStatus(video.streamId);

  if (status === "ready") {
    await prisma.video.update({
      where: { id: video.id },
      data: { status: "READY" },
    });
  }

  return data({ status });
};