import { useLoaderData } from "react-router";
import { Badge, BlockStack, Card, InlineStack, List, Page, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { requireShopDev } from "../utils/requireShopDev.server";

export const loader = async () => {
  const { shop } = await requireShopDev();

  const [playlistCount, videoCount, settingsCount] = await Promise.all([
    prisma.playlist.count({ where: { shopId: shop.id } }),
    prisma.video.count({ where: { shopId: shop.id } }),
    prisma.themeSettings.count({ where: { shopId: shop.id } }),
  ]);

  const appUrl = process.env.SHOPIFY_APP_URL || process.env.APP_URL || process.env.HOST || "";
  const redirectUrl = `${appUrl.replace(/\/$/, "")}/auth/callback`;
  const scopes = (process.env.SCOPES || "read_products,write_products,read_themes,write_app_proxy")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return {
    shopDomain: shop.shopDomain,
    appUrl,
    redirectUrl,
    proxyUrl: `https://${shop.shopDomain}/apps/carrousel`,
    scopes,
    checklist: {
      hasMedia: videoCount > 0,
      hasPlaylists: playlistCount > 0,
      legacyThemeSettings: settingsCount > 0,
    },
  };
};

export default function SettingsPage() {
  const { appUrl, redirectUrl, proxyUrl, scopes, checklist, shopDomain } = useLoaderData();

  return (
    <Page title="Settings" subtitle="Operational settings for the Shopify app and Theme Editor flow.">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              App endpoints
            </Text>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">Connected shop</Text>
              <Badge>{shopDomain}</Badge>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">Application URL</Text>
              <Text as="span" variant="bodySm" tone="subdued">{appUrl || "Not resolved"}</Text>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">Redirect URI</Text>
              <Text as="span" variant="bodySm" tone="subdued">{redirectUrl}</Text>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">App proxy</Text>
              <Text as="span" variant="bodySm" tone="subdued">{proxyUrl}</Text>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Required scopes
            </Text>
            <List>
              {scopes.map((scope) => (
                <List.Item key={scope}>{scope}</List.Item>
              ))}
            </List>
            <Text as="p" variant="bodyMd" tone="subdued">
              If a scope was added recently, reinstall or reauthorize the app in the development store before testing the Theme Editor.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Readiness checklist
            </Text>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">Media uploaded</Text>
              <Badge tone={checklist.hasMedia ? "success" : "attention"}>{checklist.hasMedia ? "Ready" : "Pending"}</Badge>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">Playlist created</Text>
              <Badge tone={checklist.hasPlaylists ? "success" : "attention"}>{checklist.hasPlaylists ? "Ready" : "Pending"}</Badge>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">Legacy admin theme settings</Text>
              <Badge tone={checklist.legacyThemeSettings ? "info" : undefined}>{checklist.legacyThemeSettings ? "Exists" : "Unused"}</Badge>
            </InlineStack>
            <Text as="p" variant="bodyMd" tone="subdued">
              Theme styling now belongs in the Theme Editor block settings. The legacy theme settings record is kept only for backward compatibility.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
