import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import {
  AppProvider,
  Frame, // ← Adicione Frame aqui
  Page,
  Layout,
  Navigation,
} from "@shopify/polaris";
import {
  ImageIcon,
  CollectionIcon,
} from "@shopify/polaris-icons";

export const loader = async ({ request }) => {
  const DEV_MODE = true; // 👈 mudar depois!

  if (!DEV_MODE) {
    await authenticate.admin(request);
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function AppLayout() {
  const { apiKey } = useLoaderData();

  return (
    <ShopifyAppProvider isEmbeddedApp apiKey={apiKey}>
      <AppProvider i18n={{}}>
        <Frame> {/* ← Adicione Frame aqui */}
          <Page fullWidth>
            <Layout>
              <Layout.Section secondary>
                <Navigation location="/">
                  <Navigation.Section
                    items={[
                      {
                        label: "Media Gallery",
                        icon: ImageIcon,
                        url: "/app/library",
                      },
                      {
                        label: "Playlists",
                        icon: CollectionIcon,
                        url: "/app/playlists",
                      },
                    ]}
                  />
                </Navigation>
              </Layout.Section>

              <Layout.Section>
                <Outlet />
              </Layout.Section>
            </Layout>
          </Page>
        </Frame> {/* ← Feche Frame aqui */}
      </AppProvider>
    </ShopifyAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
