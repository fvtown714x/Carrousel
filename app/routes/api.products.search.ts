import type { LoaderFunctionArgs } from "react-router";
import { requireShop } from "../utils/requireShop.server";
import prisma from "../db.server";

const DEV_PLACEHOLDER = "dev-shop.myshopify.com";

type CredentialsCandidate = {
  shopDomain: string;
  accessToken: string;
  source: string;
};

function normalizeProducts(raw: any[]) {
  return raw.map((node) => ({
    id: node.id,
    title: node.title,
    status: node.status,
    handle: node.handle,
    image: node.featuredImage?.url || null,
  }));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") || "").trim();

    const { session, shop, admin } = await requireShop(request);
    let shopDomain = shop?.shopDomain || session?.shop || "";

    if (!shopDomain) {
      return Response.json(
        {
          products: [],
          error: "No connected Shopify store found. Open the app once in Shopify Admin to sync the store session.",
        },
        { status: 401 },
      );
    }

    const gqlQuery = `
      query SearchProducts($query: String!) {
        products(first: 25, query: $query, sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              status
              handle
              featuredImage {
                url
              }
            }
          }
        }
      }
    `;

    const variables = {
      query: query ? `${query} status:ACTIVE` : "status:ACTIVE",
    };

    // 1) Primary path: authenticated admin context from the current request.
    if (admin) {
      try {
        const response = await admin.graphql(gqlQuery, { variables });
        const payload: any = await response.json();
        if (response.ok && !payload?.errors) {
          const edges = payload?.data?.products?.edges || [];
          return Response.json({ products: normalizeProducts(edges.map((edge: any) => edge.node)) });
        }
      } catch (adminError) {
        console.warn("[api.products.search] admin client path failed", adminError);
      }
    }

    // 2) Fallback path: try real credentials from Shop + Session tables.
    const candidates: CredentialsCandidate[] = [];

    if (
      shop?.shopDomain &&
      shop.shopDomain !== DEV_PLACEHOLDER &&
      shop?.accessToken &&
      shop.accessToken !== "dev-token"
    ) {
      candidates.push({ shopDomain: shop.shopDomain, accessToken: shop.accessToken, source: "requireShop" });
    }

    const shopRows = await prisma.shop.findMany({
      where: {
        uninstalledAt: null,
        shopDomain: { not: DEV_PLACEHOLDER },
        NOT: { accessToken: "dev-token" },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { shopDomain: true, accessToken: true },
    });

    for (const row of shopRows) {
      if (row.shopDomain && row.accessToken) {
        candidates.push({ shopDomain: row.shopDomain, accessToken: row.accessToken, source: "shop-table" });
      }
    }

    const sessionRows = await prisma.session.findMany({
      where: {
        shop: { not: DEV_PLACEHOLDER },
        accessToken: { not: "" },
      },
      orderBy: [{ isOnline: "asc" }, { expires: "desc" }],
      take: 10,
      select: { shop: true, accessToken: true },
    });

    for (const row of sessionRows) {
      if (row.shop && row.accessToken) {
        candidates.push({ shopDomain: row.shop, accessToken: row.accessToken, source: "session-table" });
      }
    }

    const deduped = Array.from(
      new Map(candidates.map((c) => [`${c.shopDomain}::${c.accessToken}`, c])).values(),
    );

    if (deduped.length === 0) {
      return Response.json(
        {
          products: [],
          error:
            "Unable to load products: no real Shopify store token found. Open the app in Shopify Admin to authenticate.",
        },
        { status: 401 },
      );
    }

    let lastError: string | null = null;

    for (const candidate of deduped) {
      try {
        const response = await fetch(`https://${candidate.shopDomain}/admin/api/2025-07/graphql.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": candidate.accessToken,
          },
          body: JSON.stringify({ query: gqlQuery, variables }),
        });

        const payload: any = await response.json();
        if (response.ok && !payload?.errors) {
          const edges = payload?.data?.products?.edges || [];
          return Response.json({ products: normalizeProducts(edges.map((edge: any) => edge.node)) });
        }

        const graphqlMessage = Array.isArray(payload?.errors)
          ? payload.errors.map((entry: any) => entry?.message).filter(Boolean).join(" | ")
          : null;
        lastError = graphqlMessage || `${response.status} ${response.statusText} via ${candidate.source}`;
      } catch (candidateError: any) {
        lastError = `${candidateError?.message || "Unknown error"} via ${candidate.source}`;
      }
    }

    return Response.json(
      {
        products: [],
        error: lastError
          ? `Shopify GraphQL request failed while loading products: ${lastError}`
          : "Unable to load products with available store credentials.",
      },
      { status: 502 },
    );
  } catch (error: any) {
    console.error("[api.products.search] failed", error);

    const details =
      typeof error?.message === "string" && error.message.trim().length > 0
        ? ` ${error.message}`
        : "";

    return Response.json(
      { products: [], error: `Unexpected error while loading products.${details}` },
      { status: 500 },
    );
  }
};
