  export async function createStreamUploadUrl() {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxDurationSeconds: 300,
          allowedOrigins: ["*"],
          requireSignedURLs: false,
        }),
      }
    );

    const data = await res.json();

    if (!data.success) {
      throw new Error("Cloudflare Stream upload URL creation failed");
    }

    return {
      uploadURL: data.result.uploadURL,
      streamId: data.result.uid,
    };
  }
