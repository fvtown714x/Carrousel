import { useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import { Badge, BlockStack, Button, Card, InlineGrid, InlineStack, Page, Tabs, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { requireShopDev } from "../utils/requireShopDev.server";

export const loader = async () => {
  const { shop } = await requireShopDev();

  const [playlistCount, videoCount, settingsCount, subscription] = await Promise.all([
    prisma.playlist.count({ where: { shopId: shop.id } }),
    prisma.video.count({ where: { shopId: shop.id } }),
    prisma.themeSettings.count({ where: { shopId: shop.id } }),
    prisma.billingSubscription.findUnique({
      where: { shopId: shop.id },
      select: { planName: true, status: true },
    }),
  ]);

  return {
    subscription,
    checklist: {
      hasMedia: videoCount > 0,
      hasPlaylists: playlistCount > 0,
      legacyThemeSettings: settingsCount > 0,
    },
  };
};

export default function SettingsPage() {
  const { subscription, checklist } = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState(0);

  const tabs = useMemo(
    () => [
      { id: "plans-pricing", content: "Plans & Pricing", panelID: "plans-pricing-panel" },
      { id: "widget-settings", content: "Widget Settings", panelID: "widget-settings-panel" },
      { id: "about", content: "About", panelID: "about-panel" },
    ],
    [],
  );

  const currentPlan = subscription?.status === "ACTIVE" ? subscription.planName || "Pro" : "Free";

  return (
    <Page title="Settings" subtitle="Manage your Vince Shoppable Videos app settings.">
      <BlockStack gap="400">
        <InlineStack align="end" gap="200">
          <Button>Reset to Defaults</Button>
          <Button variant="primary" disabled>
            Save Settings
          </Button>
        </InlineStack>

        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />

        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Plan
              </Text>
              <Text as="p" tone="subdued">
                {subscription?.status === "ACTIVE" ? `${currentPlan} plan is active.` : "No active subscription found."}
              </Text>
            </BlockStack>
            <InlineStack gap="200">
              <Button>Manage plan</Button>
              <Button>Refresh status</Button>
            </InlineStack>
          </InlineStack>
        </Card>

        {selectedTab === 0 ? (
          <InlineGrid columns={["1fr", "1fr"]} gap="300">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    Free
                  </Text>
                  {currentPlan.toLowerCase() === "free" ? <Badge tone="success">Current Plan</Badge> : null}
                </InlineStack>
                <Text as="p" tone="subdued">
                  Use Vince Shoppable Videos for free, forever.
                </Text>
                <Text as="p" variant="heading2xl">
                  $0
                  <Text as="span" tone="subdued">
                    {" "}
                    / month
                  </Text>
                </Text>
                <BlockStack gap="100">
                  <Text as="p">Unlimited video views</Text>
                  <Text as="p">Track views, clicks and engagement</Text>
                  <Text as="p">Add videos from Instagram & TikTok</Text>
                  <Text as="p">Product tagging</Text>
                  <Text as="p">Match videos to your store&apos;s design</Text>
                  <Text as="p">Show up to 10 videos per gallery</Text>
                  <Text as="p">Live support</Text>
                </BlockStack>
                <Button disabled={currentPlan.toLowerCase() === "free"}>
                  {currentPlan.toLowerCase() === "free" ? "Current Plan" : "Switch to Free Plan"}
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    Pro
                  </Text>
                  {currentPlan.toLowerCase() === "pro" ? <Badge tone="success">Current Plan</Badge> : null}
                </InlineStack>
                <Text as="p" tone="subdued">
                  Affordable for everyone.
                </Text>
                <Text as="p" variant="heading2xl">
                  $19
                  <Text as="span" tone="subdued">
                    {" "}
                    / month
                  </Text>
                </Text>
                <BlockStack gap="100">
                  <Text as="p">Post unlimited videos anywhere</Text>
                  <Text as="p">Remove Vince Shoppable Videos branding</Text>
                  <Text as="p">Tag multiple products per video</Text>
                  <Text as="p">Bulk upload videos</Text>
                  <Text as="p">Track orders from each video</Text>
                  <Text as="p">Add up to 50 videos per slider</Text>
                  <Text as="p">Priority Support</Text>
                </BlockStack>
                <Button variant={currentPlan.toLowerCase() === "pro" ? "secondary" : "primary"} disabled={currentPlan.toLowerCase() === "pro"}>
                  {currentPlan.toLowerCase() === "pro" ? "Current Plan" : "Change to Pro Plan"}
                </Button>
              </BlockStack>
            </Card>
          </InlineGrid>
        ) : null}

        {selectedTab === 1 ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Widget Settings
              </Text>
              <Text as="p" tone="subdued">
                Widget controls are now managed directly in the Theme Editor.
              </Text>
              <InlineStack gap="200">
                <Badge tone={checklist.hasMedia ? "success" : "attention"}>
                  {checklist.hasMedia ? "Media uploaded" : "Upload media"}
                </Badge>
                <Badge tone={checklist.hasPlaylists ? "success" : "attention"}>
                  {checklist.hasPlaylists ? "Playlist created" : "Create playlist"}
                </Badge>
                <Badge tone={checklist.legacyThemeSettings ? "info" : undefined}>
                  {checklist.legacyThemeSettings ? "Legacy settings found" : "Theme Editor active"}
                </Badge>
              </InlineStack>
            </BlockStack>
          </Card>
        ) : null}

        {selectedTab === 2 ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                About Vince Shoppable Videos
              </Text>
              <Text as="p" tone="subdued">
                Create shoppable video experiences, tag products, and track engagement from your storefront.
              </Text>
            </BlockStack>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}
