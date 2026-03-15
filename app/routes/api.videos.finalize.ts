import prisma from "../db.server";
import type { ActionFunction } from "react-router";

export const action: ActionFunction = async ({ request }) => {
  const form = await request.formData();
  const id = form.get("videoId");

  // Validação
  if (!id || typeof id !== "string") {
    return Response.json(
      { error: "videoId é obrigatório" }, 
      { status: 400 }
    );
  }

  await prisma.video.update({
    where: { id },
    data: { status: "READY" },
  });

  return Response.json({ success: true });
};
