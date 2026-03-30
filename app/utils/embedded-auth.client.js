export async function getEmbeddedHeaders(initialHeaders = {}) {
  const headers = new Headers(initialHeaders);

  if (typeof window === "undefined") {
    return headers;
  }

  try {
    const token = await window.shopify?.idToken?.();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (error) {
    console.warn("[embedded-auth] failed to get session token", error);
  }

  return headers;
}