import { BlockStack, Card, InlineGrid, Link, List, Page, Text } from "@shopify/polaris";

export default function AdditionalPage() {
  return (
    <Page title="Additional page" subtitle="Examples and references for app navigation.">
      <InlineGrid columns={{ xs: 1, md: "2fr 1fr" }} gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Multiple pages
            </Text>
            <Text as="p" variant="bodyMd">
              The app template comes with an additional page which demonstrates how to create multiple pages
              within app navigation using <Link url="https://shopify.dev/docs/apps/tools/app-bridge" target="_blank">App Bridge</Link>.
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              To create your own page and have it show up in the app navigation, add a page inside app/routes,
              and a link to it in the ui-nav-menu component found in app/routes/app.jsx.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Resources
            </Text>
            <List>
              <List.Item>
                <Link
                  url="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
                  target="_blank"
                >
                  App nav best practices
                </Link>
              </List.Item>
            </List>
          </BlockStack>
        </Card>
      </InlineGrid>
    </Page>
  );
}
