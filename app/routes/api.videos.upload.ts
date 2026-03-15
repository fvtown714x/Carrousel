
import prisma from "../db.server";
import { uploadVideo } from "../services/cloudinary.server";
import type { ActionFunctionArgs } from "react-router";
import { requireShopDev } from "../utils/requireShopDev.server";

export const action = async ({ request }: ActionFunctionArgs) => {

  console.log("UPLOAD ROUTE HIT");

  try {

    const { shop } = await requireShopDev();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = (await uploadVideo(buffer)) as any;

    const type = result.resource_type === "video" ? "VIDEO" : "IMAGE";

    const video = await prisma.video.create({
      data: {
        shopId: shop.id,
        status: "READY",
        type,
        originalUrl: result.secure_url,
        thumbnailUrl:
          result.resource_type === "video"
            ? result.secure_url.replace("/upload/", "/upload/so_1/")
            : result.secure_url,
        duration: Math.round(result.duration || 0),
      },
    });

    return Response.json({
      success: true,
      video: {
        id: video.id,
        url: video.originalUrl,
        thumbnail: video.thumbnailUrl,
        duration: video.duration,
        type: video.type,
      },
    });

  } catch (error) {

    console.error("UPLOAD ERROR:", error);

    return Response.json(
      { error: "Upload failed" },
      { status: 500 }
    );

  }
};