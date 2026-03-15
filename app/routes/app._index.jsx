import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireShopDev } from "../utils/requireShopDev.server";

export const loader = async ({ request }) => {
  await requireShopDev();

  return {
    onboarding: {
      appInstalled: true,
      contentAdded: false,
      playlistCreated: false,
      playlistEmbedded: false,
    },
  };
};

export default function Index({ loaderData }) {
  const { onboarding } = loaderData;

  const steps = [
    onboarding.appInstalled,
    onboarding.contentAdded,
    onboarding.playlistCreated,
    onboarding.playlistEmbedded,
  ];

    const completed = steps.filter(Boolean).length;
  const progress = Math.round((completed / steps.length) * 100);

  const [dismissed, setDismissed] = useState(false);
  return (
    <s-page heading="Dashboard">

      {/* ===== PRIMARY ACTIONS ===== */}
      <s-button slot="primary-action">
        Book Free Setup Call
      </s-button>

      <s-button slot="secondary-actions">
        Watch Setup Video
      </s-button>

      {/* ===== BLUE SETUP BANNER ===== */}
      {!dismissed && progress < 100 && (
        <s-banner
          tone="info"
          heading="Complete setup to unlock analytics"
          dismissible
          onDismiss={() => setDismissed(true)}
        >
          Finish setting up your widgets to start tracking performance
          metrics and see detailed insights about your content's impact on sales.
        </s-banner>
      )}

      {/* ===== SETUP GUIDE CARD ===== */}
      <s-section heading="Setup Guide">
        <s-paragraph>
          Complete setup steps to maximize your store's potential
        </s-paragraph>

        <s-progress-bar value={progress}></s-progress-bar>

        <s-stack direction="block" gap="base">

          {/* Step 1 */}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" align="space-between">
              <s-text>Install App</s-text>
              {onboarding.appInstalled && (
                <s-badge tone="success">Completed</s-badge>
              )}
            </s-stack>
          </s-box>

          {/* Step 2 */}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" align="space-between">
              <s-stack direction="block">
                <s-text>Add Videos and Tag Products</s-text>
                <s-text tone="subdued">
                  Upload short videos and tag relevant products to make them
                  shoppable.
                </s-text>
              </s-stack>

              {!onboarding.contentAdded && (
                <s-button variant="primary">
                  Add Content
                </s-button>
              )}
            </s-stack>
          </s-box>

          {/* Step 3 */}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" align="space-between">
              <s-text>Create Your First Playlist</s-text>
              {!onboarding.playlistCreated && (
                <s-button variant="secondary">
                  Create Playlist
                </s-button>
              )}
            </s-stack>
          </s-box>

          {/* Step 4 */}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" align="space-between">
              <s-text>Show Playlists on Pages</s-text>
              {!onboarding.playlistEmbedded && (
                <s-button variant="secondary">
                  Embed Playlist
                </s-button>
              )}
            </s-stack>
          </s-box>

        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
