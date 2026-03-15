import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import type { FetcherWithComponents } from "react-router";

import {
  Page,
  Card,
  DropZone,
  Thumbnail,
  Spinner,
  Text,
  InlineStack,
  TextField,
  Button,
  BlockStack,
} from "@shopify/polaris";

import { useEffect, useState } from "react";
import { requireShop } from "../utils/requireShop.server";
import prisma from "../db.server";

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type VideoDTO = {
  id: string;
  shopId: string;
  title?: string | null;
  description?: string | null;
  duration?: number | null;
  status?: string;
  streamId?: string | null;
  originalUrl?: string | null;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

type LoaderData = {
  videos: VideoDTO[];
};

/* -------------------------------------------------------------------------- */
/*                                   LOADER                                   */
/* -------------------------------------------------------------------------- */

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);

  const videos = await prisma.video.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
  });

  return data({ videos });
}

/* -------------------------------------------------------------------------- */
/*                                   ACTION                                   */
/* -------------------------------------------------------------------------- */

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const formData = await request.formData();

  const sourceUrl = formData.get("url");

  if (!sourceUrl || typeof sourceUrl !== "string") {
    return data({ error: "Invalid URL" }, { status: 400 });
  }

  // 1️⃣ cria o vídeo imediatamente (feedback visual)
  const video = await prisma.video.create({
    data: {
      shopId: shop.id,
      status: "PROCESSING",
      originalUrl: sourceUrl,
    },
  });

  try {
    // 2️⃣ chama Apify
    const apifyRes = await fetch(
      `https://api.apify.com/v2/acts/apify~video-downloader/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },  // ← JSON aqui!
        body: JSON.stringify({ url: sourceUrl }),          // ← JSON.stringify aqui!
      }
    );

    const [result] = await apifyRes.json();                // ← .json() aqui!

    if (!result?.videoUrl) {
      throw new Error("Apify failed");
    }

    // 3️⃣ upload para Cloudflare Stream
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/copy`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_TOKEN}`,
          "Content-Type": "application/json",              // ← JSON aqui!
        },
        body: JSON.stringify({                             // ← JSON.stringify aqui!
          url: result.videoUrl,
        }),
      }
    );

    const cfData = await cfRes.json();                     // ← .json() aqui!

    // 4️⃣ finaliza
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: "READY",
        streamId: cfData.result.uid,
        thumbnailUrl: result.thumbnailUrl ?? null,
        duration: result.duration ?? null,
      },
    });

    return data({ success: true });
  } catch (error) {
    await prisma.video.update({
      where: { id: video.id },
      data: { status: "FAILED" },
    });

    return data({ error: "Import failed" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*                                   PAGE                                     */
/* -------------------------------------------------------------------------- */

export default function MediaPage() {
  const { videos } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();

  useEffect(() => {
    const interval = setInterval(() => {
      fetcher.load("/app/media");
    }, 5000);

    return () => clearInterval(interval);
  }, [fetcher]);

  return (
    <Page title="Video Library">
      <Card>
        <InlineStack gap="400" wrap>
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </InlineStack>
      </Card>

      <UploadSection fetcher={fetcher} />
    </Page>
  );
}

/* -------------------------------------------------------------------------- */
/*                               UPLOAD SECTION                                */
/* -------------------------------------------------------------------------- */

function UploadSection({
  fetcher,
}: {
  fetcher: FetcherWithComponents<any>;
}) {
  const uploading = fetcher.state !== "idle";
  const [url, setUrl] = useState("");

  const MAX_SIZE = 100 * 1024 * 1024;

  const handleDrop = async (_dropFiles, acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const res = await fetch("/api/videos/upload", { method: "POST" });
    if (!res.ok) {
      alert("Upload failed");
      return;
    }
    const { uploadURL, videoId } = await res.json();

    await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });

    await fetch("/api/videos/finalize", {
      method: "POST",
      body: new URLSearchParams({ videoId }),
    });
  };

  const handleImport = () => {
    if (!url) return;

    fetcher.submit(
      { url },
      {
        method: "POST",
        action: "/app/media",
      }
    );

    setUrl("");
  };

  return (
    <Card>
      <BlockStack gap="400">
        <TextField
          label="Import from TikTok or Instagram"
          value={url}
          onChange={setUrl}
          placeholder="https://www.tiktok.com/..."
          autoComplete="off"
        />

        <Button onClick={handleImport} loading={uploading}>
          Import
        </Button>

        <DropZone
          accept="video/mp4,video/webm,video/quicktime"
          onDrop={handleDrop}
        >
          <DropZone.FileUpload />
        </DropZone>

        {uploading && (
          <InlineStack gap="200" align="center">
            <Spinner size="small" />
            <Text as="span">Processing...</Text>
          </InlineStack>
        )}
      </BlockStack>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  VIDEO CARD                                */
/* -------------------------------------------------------------------------- */

function VideoCard({ video }: { video: VideoDTO }) {
  return (
    <Card>
      {video.thumbnailUrl ? (
        <Thumbnail source={video.thumbnailUrl} alt="" />
      ) : (
        <Spinner />
      )}

      <Text as="h6">Status: {video.status}</Text>
    </Card>
  );
}
