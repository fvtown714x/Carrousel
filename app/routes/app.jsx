import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  AppProvider,
  Page,
  Layout,
  Navigation,
} from "@shopify/polaris";
import {
  ImageIcon,
  CollectionIcon,
} from "@shopify/polaris-icons";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function AppLayout() {
  return (
    <Page fullWidth>
      <Layout>
        <Layout.Section secondary>
          <Navigation location="/">
            <Navigation.Section
              items={[
                {
                  label: "Media Gallery",
                  icon: ImageIcon,
                  url: "/app/media",
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
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
