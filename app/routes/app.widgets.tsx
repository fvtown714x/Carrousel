import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Badge, Banner, BlockStack, Button, Card, InlineStack, List, Page, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { requireShopDev } from "../utils/requireShopDev.server";

type TemplateName = "product" | "index" | "collection";

type AdminThemeNode = {
  id: string;
  name: string;
  role: string;
};

type ThemeFileNode = {
  filename: string;
  body?: {
    content?: string;
  } | null;
};

type TemplateLink = {
  template: TemplateName;
  editorUrl: string;
  installed: boolean;
};

type ThemeItem = {
  id: string;
  name: string;
  role: string;
  templateLinks: TemplateLink[];
};

type PlaylistPreview = {
  id: string;
  name: string;
  itemCount: number;
  proxyPreviewUrl: string;
};

type WidgetsLoaderData = {
  shopDomain: string;
  apiKey: string;
  templates: TemplateName[];
  currentThemeTemplateLinks: TemplateLink[];
  playlists: PlaylistPreview[];
  themes: ThemeItem[];
  currentThemeEditorUrl: string;
  themesAdminUrl: string;
  proxyPreviewUrl: string;
};

function extractThemeId(gid: string) {
  return gid?.split("/").pop() || "";
}

function containsCarrouselBlock(content: string | undefined) {
  if (!content) return false;
  return content.includes("/blocks/carrousel-block/") || content.includes("carrousel-block");
}

function buildEditorUrl({
  shopDomain,
  themeId,
  apiKey,
  template,
  target = "mainSection",
}: {
  shopDomain: string;
  themeId?: string;
  apiKey: string;
  template: TemplateName;
  target?: string;
}) {
  const themePath = themeId ? `/admin/themes/${themeId}/editor` : "/admin/themes/current/editor";
  return `https://${shopDomain}${themePath}?template=${template}&addAppBlockId=${apiKey}/carrousel-block&target=${target}`;
}

export const loader = async ({ request }: LoaderFunctionArgs): Promise<WidgetsLoaderData> => {
  let admin = null;
  let shopDomain = "";
  let shopId = "";
  const installedTemplates = new Set<TemplateName>();

  try {
    const auth = await authenticate.admin(request);
    admin = auth.admin;
    shopDomain = auth.session.shop;
  } catch (error) {
    console.warn("[app.widgets] authenticate.admin failed, falling back to dev helper", error);
  }

  if (!shopDomain) {
    const fallback = await requireShopDev();
    shopDomain = fallback.shop.shopDomain;
    shopId = fallback.shop.id;
  }

  if (!shopId && shopDomain) {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });
    shopId = shop?.id || "";
  }

  const apiKey = process.env.SHOPIFY_API_KEY || process.env.API_KEY || "";
  let themes: AdminThemeNode[] = [];

  if (admin) {
    try {
      const response = await admin.graphql(`
        query WidgetThemes {
          themes(first: 20) {
            nodes {
              id
              name
              role
            }
          }
        }
      `);

      const payload = (await response.json()) as {
        data?: {
          themes?: {
            nodes?: AdminThemeNode[];
          };
        };
      };
      themes = payload?.data?.themes?.nodes || [];

      const mainTheme = themes.find((theme) => theme.role === "MAIN");
      if (mainTheme) {
        const themeResponse = await admin.graphql(
          `
            query ThemeFiles($id: ID!, $filenames: [String!]) {
              theme(id: $id) {
                files(first: 10, filenames: $filenames) {
                  nodes {
                    filename
                    body {
                      ... on OnlineStoreThemeFileBodyText {
                        content
                      }
                    }
                  }
                }
              }
            }
          `,
          {
            variables: {
              id: mainTheme.id,
              filenames: [
                "templates/product.json",
                "templates/index.json",
                "templates/collection.json",
              ],
            },
          },
        );

        const themePayload = (await themeResponse.json()) as {
          data?: {
            theme?: {
              files?: {
                nodes?: ThemeFileNode[];
              };
            };
          };
        };

        const fileNodes = themePayload?.data?.theme?.files?.nodes || [];
        for (const fileNode of fileNodes) {
          if (fileNode.filename === "templates/product.json" && containsCarrouselBlock(fileNode.body?.content)) {
            installedTemplates.add("product");
          }
          if (fileNode.filename === "templates/index.json" && containsCarrouselBlock(fileNode.body?.content)) {
            installedTemplates.add("index");
          }
          if (fileNode.filename === "templates/collection.json" && containsCarrouselBlock(fileNode.body?.content)) {
            installedTemplates.add("collection");
          }
        }
      }
    } catch (error) {
      console.error("[app.widgets] failed to load themes", error);
    }
  }

  const playlists = shopId
    ? await prisma.playlist.findMany({
        where: { shopId },
        orderBy: [{ name: "asc" }],
        include: {
          _count: {
            select: { videos: true },
          },
        },
      })
    : [];

  const templates: TemplateName[] = ["product", "index", "collection"];
  const currentThemeEditorUrl = buildEditorUrl({ shopDomain, apiKey, template: "product" });

  return {
    shopDomain,
    apiKey,
    templates,
    currentThemeTemplateLinks: templates.map((template) => ({
      template,
      editorUrl: buildEditorUrl({ shopDomain, apiKey, template }),
      installed: installedTemplates.has(template),
    })),
    playlists: playlists.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      itemCount: playlist._count.videos,
      proxyPreviewUrl: `https://${shopDomain}/apps/carrousel?source=playlist&playlist=${encodeURIComponent(playlist.name)}`,
    })),
    themes: themes.map((theme: AdminThemeNode) => ({
      id: extractThemeId(theme.id),
      name: theme.name,
      role: theme.role,
      templateLinks: templates.map((template) => ({
        template,
        editorUrl: buildEditorUrl({
          shopDomain,
          themeId: extractThemeId(theme.id),
          apiKey,
          template,
        }),
        installed: theme.role === "MAIN" ? installedTemplates.has(template) : false,
      })),
    })),
    currentThemeEditorUrl,
    themesAdminUrl: `https://${shopDomain}/admin/themes`,
    proxyPreviewUrl: `https://${shopDomain}/apps/carrousel`,
  };
};

export default function WidgetsPage() {
  const { themes, currentThemeEditorUrl, currentThemeTemplateLinks, themesAdminUrl, playlists, proxyPreviewUrl } =
    useLoaderData<typeof loader>() as WidgetsLoaderData;
  const liveTheme = themes.find((theme: ThemeItem) => theme.role === "MAIN");

  return (
    <Page title="Widgets" subtitle="Configure where your playlists are shown in your storefront.">
      <BlockStack gap="400">
        <Banner tone="info" title="Theme customization now lives in the Theme Editor">
          <p>Use the App Block to control layout, colors, fonts and media source directly inside the storefront theme.</p>
        </Banner>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Recommended setup
            </Text>
            <List>
              <List.Item>Open the Theme Editor from this page and add the Carousel block to the product template.</List.Item>
              <List.Item>Duplicate your live theme in Shopify Admin before publishing changes.</List.Item>
              <List.Item>Use the Theme Editor settings to choose the media source, colors, spacing and font behavior.</List.Item>
            </List>
            <InlineStack gap="200">
              <Button url={currentThemeEditorUrl} target="_top" variant="primary">
                Open Product Theme Editor
              </Button>
              <Button url={themesAdminUrl} target="_top">
                Open Themes
              </Button>
              <Button url={proxyPreviewUrl} target="_blank">
                Test App Proxy
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Add block by template
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Use these direct links to open the current theme editor already targeted to the template where the carousel should be added.
            </Text>
            <BlockStack gap="200">
              {currentThemeTemplateLinks.map((entry: TemplateLink) => (
                <InlineStack key={entry.template} align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="bodyMd">{entry.template}</Text>
                    <Badge tone={entry.installed ? "success" : "attention"}>
                      {entry.installed ? "Installed" : "Not installed"}
                    </Badge>
                  </InlineStack>
                  <Button url={entry.editorUrl} target="_top">
                    Open editor
                  </Button>
                </InlineStack>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Theme testing
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Automatic theme duplication via API requires a Shopify exemption for write_themes. This app is set up for the safer manual flow: duplicate in Admin, test there, then publish.
            </Text>
            {liveTheme ? (
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd">Live theme detected: {liveTheme.name}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Duplicate this theme first, then open the duplicate in the editor.</Text>
                </BlockStack>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone={liveTheme.templateLinks.some((entry) => entry.installed) ? "success" : "attention"}>
                    {liveTheme.templateLinks.some((entry) => entry.installed) ? "Block found" : "Block missing"}
                  </Badge>
                  <Button url={liveTheme.templateLinks[0]?.editorUrl} target="_top">
                    Open Live Theme Editor
                  </Button>
                </InlineStack>
              </InlineStack>
            ) : null}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Playlist previews
            </Text>
            {playlists.length === 0 ? (
              <Text as="p" variant="bodyMd" tone="subdued">
                Create at least one playlist to test playlist-driven blocks in the storefront.
              </Text>
            ) : (
              playlists.map((playlist: PlaylistPreview) => (
                <InlineStack key={playlist.id} align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">{playlist.name}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{playlist.itemCount} items</Text>
                  </BlockStack>
                  <Button url={playlist.proxyPreviewUrl} target="_blank">
                    Preview via proxy
                  </Button>
                </InlineStack>
              ))
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Available themes
            </Text>
            {themes.length === 0 ? (
              <Text as="p" variant="bodyMd" tone="subdued">
                No themes were returned by the Admin API. Reinstall the app after approving the updated scopes if needed.
              </Text>
            ) : (
              themes.map((theme: ThemeItem) => (
                <InlineStack key={theme.id} align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">{theme.name}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Role: {theme.role}</Text>
                  </BlockStack>
                  <InlineStack gap="200">
                    {theme.templateLinks.map((entry: TemplateLink) => (
                      <InlineStack key={`${theme.id}-${entry.template}`} gap="100" blockAlign="center">
                        <Button url={entry.editorUrl} target="_top">
                          {entry.template}
                        </Button>
                        {theme.role === "MAIN" ? (
                          <Badge tone={entry.installed ? "success" : "attention"}>
                            {entry.installed ? "Installed" : "Missing"}
                          </Badge>
                        ) : null}
                      </InlineStack>
                    ))}
                  </InlineStack>
                </InlineStack>
              ))
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
