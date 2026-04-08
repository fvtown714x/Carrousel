import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const skipAdminAuth =
    process.env.NODE_ENV !== "production" && process.env.SKIP_ADMIN_AUTH === "true";

  if (!skipAdminAuth) {
    await authenticate.admin(request);
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || process.env.API_KEY || "" };
};

export default function AppLayout() {
  const { apiKey } = useLoaderData();

  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">
          Dashboard
        </a>
        <a href="/app/library">Media</a>
        <a href="/app/playlists">Playlists</a>
        <a href="/app/widgets">Widgets</a>
        <a href="/app/settings">Settings</a>
      </NavMenu>
      <AppProvider i18n={{}}>
        <Outlet />
      </AppProvider>
    </ShopifyAppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[app.jsx ErrorBoundary]", error);
  return boundary.error(error);
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
