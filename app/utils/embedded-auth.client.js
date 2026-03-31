export async function getEmbeddedHeaders(initialHeaders = {}) {
  const headers = new Headers(initialHeaders);

  if (typeof window === "undefined") {
    return headers;
  }

  try {
    const tokenPromise = window.shopify?.idToken?.();
    const token = await Promise.race([
      tokenPromise,
      new Promise((resolve) => {
        setTimeout(() => resolve(null), 1500);
      }),
    ]);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (error) {
    console.warn("[embedded-auth] failed to get session token", error);
  }

  return headers;
}