import { useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Page,
  ProgressBar,
  Select,
  Text,
} from "@shopify/polaris";
import { requireShopDev } from "../utils/requireShopDev.server";
import prisma from "../db.server";

function getSortValue(row, key) {
  if (key === "title" || key === "name") {
    return String(row[key] || "").toLowerCase();
  }
  return Number(row[key] || 0);
}

function sortRows(rows, sortState) {
  const sorted = [...rows].sort((a, b) => {
    const aValue = getSortValue(a, sortState.key);
    const bValue = getSortValue(b, sortState.key);
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
  });
  return sortState.direction === "asc" ? sorted : sorted.reverse();
}

export const loader = async () => {
  const { shop } = await requireShopDev();

  const [videoCount, taggedVideoCount, playlistCount, themeSettingsCount, playlists, videos, interactions] = await Promise.all([
    prisma.video.count({ where: { shopId: shop.id } }),
    prisma.video.count({
      where: {
        shopId: shop.id,
        productTags: {
          some: {},
        },
      },
    }),
    prisma.playlist.count({ where: { shopId: shop.id } }),
    prisma.themeSettings.count({ where: { shopId: shop.id } }),
    prisma.playlist.findMany({
      where: { shopId: shop.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.video.findMany({
      where: { shopId: shop.id },
      include: {
        analytics: true,
        productTags: true,
        playlists: {
          include: {
            playlist: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.videoInteractionEvent
      .findMany({
        where: { shopId: shop.id },
        select: {
          videoId: true,
          eventType: true,
          cartToken: true,
          productId: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      })
      .catch(() => []),
  ]);

  let recentOrders = [];
  if (shop.shopDomain && shop.accessToken) {
    try {
      const ordersResponse = await fetch(
        `https://${shop.shopDomain}/admin/api/2025-07/orders.json?status=any&limit=250&fields=id,cart_token,current_total_price,currency`,
        {
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": shop.accessToken,
          },
        },
      );
      if (ordersResponse.ok) {
        const payload = await ordersResponse.json();
        recentOrders = Array.isArray(payload?.orders) ? payload.orders : [];
      }
    } catch (error) {
      console.warn("[dashboard] failed to load shopify orders", error);
    }
  }

  const ordersByCartToken = new Map();
  for (const order of recentOrders) {
    if (!order?.cart_token) continue;
    ordersByCartToken.set(String(order.cart_token), order);
  }

  const videoMetricsMap = new Map();
  const productMetricsMap = new Map();
  const orderIdsFromTagTapSessions = new Set();
  const attributedOrderIds = new Set();
  let totalAttributedRevenue = 0;

  const interactionsByCartToken = interactions.reduce((acc, event) => {
    if (!event.cartToken) return acc;
    if (!acc.has(event.cartToken)) acc.set(event.cartToken, []);
    acc.get(event.cartToken).push(event);
    return acc;
  }, new Map());

  for (const [cartToken, events] of interactionsByCartToken.entries()) {
    const order = ordersByCartToken.get(cartToken);
    if (!order) continue;
    const orderId = String(order.id);
    const orderRevenue = Number(order.current_total_price || 0);
    attributedOrderIds.add(orderId);
    totalAttributedRevenue += orderRevenue;

    const touchedVideoIds = Array.from(new Set(events.map((event) => event.videoId).filter(Boolean)));
    const touchedProductIds = Array.from(new Set(events.map((event) => event.productId).filter(Boolean)));
    const hasTagTap = events.some((event) => event.eventType === "TAG_TAP");
    if (hasTagTap) orderIdsFromTagTapSessions.add(orderId);

    const revenuePerVideo = touchedVideoIds.length > 0 ? orderRevenue / touchedVideoIds.length : 0;
    for (const videoId of touchedVideoIds) {
      if (!videoMetricsMap.has(videoId)) {
        videoMetricsMap.set(videoId, { orders: 0, revenue: 0, tagTaps: 0, atcClicks: 0, plays: 0 });
      }
      const metric = videoMetricsMap.get(videoId);
      metric.orders += 1;
      metric.revenue += revenuePerVideo;
    }

    const revenuePerProduct = touchedProductIds.length > 0 ? orderRevenue / touchedProductIds.length : 0;
    for (const productId of touchedProductIds) {
      if (!productMetricsMap.has(productId)) {
        productMetricsMap.set(productId, { orders: 0, revenue: 0, tagTaps: 0, atcClicks: 0 });
      }
      const metric = productMetricsMap.get(productId);
      metric.orders += 1;
      metric.revenue += revenuePerProduct;
    }
  }

  for (const event of interactions) {
    if (event.videoId) {
      if (!videoMetricsMap.has(event.videoId)) {
        videoMetricsMap.set(event.videoId, { orders: 0, revenue: 0, tagTaps: 0, atcClicks: 0, plays: 0 });
      }
      const metric = videoMetricsMap.get(event.videoId);
      if (event.eventType === "PLAY") metric.plays += 1;
      if (event.eventType === "TAG_TAP") metric.tagTaps += 1;
      if (event.eventType === "ADD_TO_CART") metric.atcClicks += 1;
    }

    if (event.productId) {
      if (!productMetricsMap.has(event.productId)) {
        productMetricsMap.set(event.productId, { orders: 0, revenue: 0, tagTaps: 0, atcClicks: 0 });
      }
      const metric = productMetricsMap.get(event.productId);
      if (event.eventType === "TAG_TAP") metric.tagTaps += 1;
      if (event.eventType === "ADD_TO_CART") metric.atcClicks += 1;
    }
  }

  const decoratedVideos = videos.map((video) => {
    const impressions = video.analytics?.impressions || 0;
    const tracked = videoMetricsMap.get(video.id) || { orders: 0, revenue: 0, tagTaps: 0, atcClicks: 0, plays: 0 };
    const plays = tracked.plays || video.analytics?.plays || 0;
    const tagTaps = tracked.tagTaps || video.analytics?.productClicks || 0;
    const revenue = tracked.revenue || 0;
    const taggedProductCount = video.productTags.length;
    const attributedOrders = tracked.orders || 0;
    const completionRate = plays > 0 ? Math.min(100, (plays / Math.max(impressions, plays)) * 100) : 0;
    const productTapRate = plays > 0 ? Math.min(100, (tagTaps / plays) * 100) : 0;
    const playlistsForVideo = video.playlists.map((entry) => entry.playlist);

    return {
      id: video.id,
      title: video.title || "Untitled video",
      thumbnailUrl: video.thumbnailUrl,
      taggedProductCount,
      views: plays,
      completionRate,
      productTapRate,
      attributedRevenue: revenue,
      tagTaps,
      atcClicks: tracked.atcClicks || 0,
      attributedOrders,
      productTags: video.productTags,
      playlists: playlistsForVideo,
    };
  });

  return {
    onboarding: {
      appInstalled: true,
      contentAdded: videoCount > 0 && taggedVideoCount > 0,
      playlistCreated: playlistCount > 0,
      playlistEmbedded: themeSettingsCount > 0,
    },
    analytics: {
      currency: recentOrders[0]?.currency || "USD",
      storeAov:
        recentOrders.length > 0
          ? recentOrders.reduce((acc, order) => acc + Number(order.current_total_price || 0), 0) / recentOrders.length
          : 0,
      totalAttributedRevenue,
      attributedOrders: attributedOrderIds.size,
      ordersFromTagTapSessions: orderIdsFromTagTapSessions.size,
      productMetrics: Object.fromEntries(productMetricsMap.entries()),
      playlists,
      videos: decoratedVideos,
    },
  };
};

export default function Index() {
  const { onboarding, analytics } = useLoaderData();

  const stepsDone = [
    onboarding.appInstalled,
    onboarding.contentAdded,
    onboarding.playlistCreated,
    onboarding.playlistEmbedded,
  ];

  const completed = stepsDone.filter(Boolean).length;
  const progress = Math.round((completed / stepsDone.length) * 100);

  const [setupExpanded, setSetupExpanded] = useState(true);
  const [openedStepIndex, setOpenedStepIndex] = useState(0);
  const [videoPage, setVideoPage] = useState(1);
  const [videoSort, setVideoSort] = useState({ key: "views", direction: "desc" });
  const [videoCarouselFilter, setVideoCarouselFilter] = useState("all");
  const [productSort, setProductSort] = useState({ key: "revenue", direction: "desc" });
  const [productCarouselFilter, setProductCarouselFilter] = useState("all");
  const [productVideoFilter, setProductVideoFilter] = useState("all");
  const [showAllTopProducts, setShowAllTopProducts] = useState(false);

  const carouselOptions = useMemo(
    () => [{ label: "All Carousels", value: "all" }, ...analytics.playlists.map((playlist) => ({ label: playlist.name, value: playlist.id }))],
    [analytics.playlists],
  );

  const toggleSort = (current, key, setSort) => {
    if (current.key === key) {
      setSort({ key, direction: current.direction === "asc" ? "desc" : "asc" });
      return;
    }
    setSort({ key, direction: "asc" });
  };

  const filteredVideos = useMemo(() => {
    if (videoCarouselFilter === "all") return analytics.videos;
    return analytics.videos.filter((video) => video.playlists.some((playlist) => playlist.id === videoCarouselFilter));
  }, [analytics.videos, videoCarouselFilter]);

  const sortedVideos = useMemo(() => sortRows(filteredVideos, videoSort), [filteredVideos, videoSort]);
  const pageSize = 25;
  const totalVideoPages = Math.max(1, Math.ceil(sortedVideos.length / pageSize));
  const currentVideoPage = Math.min(videoPage, totalVideoPages);
  const paginatedVideos = useMemo(() => {
    const start = (currentVideoPage - 1) * pageSize;
    return sortedVideos.slice(start, start + pageSize);
  }, [sortedVideos, currentVideoPage]);

  const availableVideosForProductFilter = useMemo(() => {
    const scopedVideos =
      productCarouselFilter === "all"
        ? analytics.videos
        : analytics.videos.filter((video) => video.playlists.some((playlist) => playlist.id === productCarouselFilter));
    return scopedVideos.map((video) => ({ label: video.title, value: video.id }));
  }, [analytics.videos, productCarouselFilter]);

  const productVideoOptions = useMemo(
    () => [{ label: "All Videos", value: "all" }, ...availableVideosForProductFilter],
    [availableVideosForProductFilter],
  );

  const productScopedVideos = useMemo(() => {
    return analytics.videos.filter((video) => {
      const carouselMatches =
        productCarouselFilter === "all" || video.playlists.some((playlist) => playlist.id === productCarouselFilter);
      const videoMatches = productVideoFilter === "all" || video.id === productVideoFilter;
      return carouselMatches && videoMatches;
    });
  }, [analytics.videos, productCarouselFilter, productVideoFilter]);

  const productRows = useMemo(() => {
    const byProduct = new Map();
    for (const video of productScopedVideos) {
      const tagCount = Math.max(video.productTags.length, 1);
      for (const tag of video.productTags) {
        const key = tag.shopifyProductId;
        if (!byProduct.has(key)) {
          byProduct.set(key, {
            productId: key,
            name: `Product ${key.replace("gid://shopify/Product/", "")}`,
            image: video.thumbnailUrl,
            appearances: 0,
            tagTaps: 0,
            atcClicks: 0,
            orders: 0,
            revenue: 0,
          });
        }
        const product = byProduct.get(key);
        const trackedProductMetrics = analytics.productMetrics?.[key] || null;
        product.appearances += 1;
        product.tagTaps += trackedProductMetrics
          ? Math.round((trackedProductMetrics.tagTaps || 0) / tagCount)
          : Math.round(video.tagTaps / tagCount);
        product.atcClicks += trackedProductMetrics
          ? Math.round((trackedProductMetrics.atcClicks || 0) / tagCount)
          : Math.round((video.atcClicks || 0) / tagCount);
        product.orders += trackedProductMetrics
          ? Math.round((trackedProductMetrics.orders || 0) / tagCount)
          : Math.round(video.attributedOrders / tagCount);
        product.revenue += trackedProductMetrics
          ? Number(((trackedProductMetrics.revenue || 0) / tagCount).toFixed(2))
          : Number((video.attributedRevenue / tagCount).toFixed(2));
      }
    }
    return sortRows(Array.from(byProduct.values()), productSort);
  }, [analytics.productMetrics, productScopedVideos, productSort]);

  const analyticsTotals = useMemo(() => {
    const totalAttributedRevenue = filteredVideos.reduce((acc, row) => acc + row.attributedRevenue, 0);
    const attributedOrders = filteredVideos.reduce((acc, row) => acc + row.attributedOrders, 0);
    const totalTagTaps = filteredVideos.reduce((acc, row) => acc + row.tagTaps, 0);
    const aovVideo = attributedOrders > 0 ? totalAttributedRevenue / attributedOrders : 0;
    const storeAov = analytics.storeAov || 0;
    const aovDelta = storeAov > 0 ? ((aovVideo - storeAov) / storeAov) * 100 : 0;
    const conversionOrders = Math.min(attributedOrders, analytics.ordersFromTagTapSessions || attributedOrders);
    const productConversionRate = totalTagTaps > 0 ? (conversionOrders / totalTagTaps) * 100 : 0;
    return {
      totalAttributedRevenue,
      attributedOrders,
      aovVideo,
      aovDelta,
      productConversionRate,
    };
  }, [analytics.ordersFromTagTapSessions, analytics.storeAov, filteredVideos]);

  const topProductsByRevenue = useMemo(() => {
    const sorted = [...productRows].sort((a, b) => b.revenue - a.revenue);
    return showAllTopProducts ? sorted : sorted.slice(0, 10);
  }, [productRows, showAllTopProducts]);

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: analytics.currency || "USD",
      maximumFractionDigits: 2,
    }).format(value || 0);

  const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;
  const sortArrow = (sortState, key) => {
    if (sortState.key !== key) return "";
    return sortState.direction === "asc" ? " ▲" : " ▼";
  };

  const exportCsv = (rows, filePrefix, columns) => {
    const today = new Date().toISOString().slice(0, 10);
    const filename = `${filePrefix}-${today}.csv`;
    const header = columns.map((column) => column.label).join(",");
    const body = rows.map((row) => columns.map((column) => `"${String(column.value(row) ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const stepItems = [
    {
      title: "Install VinciTool's App",
      description:
        "Complete the installation process and set up your VinciTool's account to start creating engaging content.",
      done: onboarding.appInstalled,
      ctaLabel: "Open Settings",
      href: "/app/settings",
    },
    {
      title: "Add Videos and Tag Products",
      description: "Upload media and connect products to make your content shoppable.",
      done: onboarding.contentAdded,
      ctaLabel: "Add Content",
      href: "/app/library",
    },
    {
      title: "Create Your First Playlist",
      description: "Group your content into playlists for more organized storefront experiences.",
      done: onboarding.playlistCreated,
      ctaLabel: "Create Playlist",
      href: "/app/playlists",
    },
    {
      title: "Show Playlists on Pages",
      description: "Complete your widget setup so playlists appear on your store pages.",
      done: onboarding.playlistEmbedded,
      ctaLabel: "Open Widgets",
      href: "/app/widgets",
    },
  ];

  return (
    <Page
      title="Dashboard"
      subtitle="Welcome to VinciTool's"
      primaryAction={{ content: "Open Products", url: "shopify://admin/products", target: "_top" }}
      secondaryActions={[{ content: "Open Customers", url: "shopify://admin/customers", target: "_top" }]}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingLg">
                Analytics Dashboard
              </Text>
              <Badge tone="info">Live Session View</Badge>
            </InlineStack>

            <InlineGrid columns={["1fr", "1fr", "1fr", "1fr"]} gap="300">
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Total Attributed Revenue</Text>
                  <Text as="h3" variant="headingMd">{formatCurrency(analyticsTotals.totalAttributedRevenue)}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Attributed Orders</Text>
                  <Text as="h3" variant="headingMd">{analyticsTotals.attributedOrders}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Avg. Order Value (Video)</Text>
                  <Text as="h3" variant="headingMd">{formatCurrency(analyticsTotals.aovVideo)}</Text>
                  <Text as="p" variant="bodySm" tone={analyticsTotals.aovDelta >= 0 ? "success" : "critical"}>
                    {`${analyticsTotals.aovDelta >= 0 ? "+" : ""}${analyticsTotals.aovDelta.toFixed(1)}% vs store avg`}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Product Conversion Rate</Text>
                  <Text as="h3" variant="headingMd">{formatPercent(analyticsTotals.productConversionRate)}</Text>
                </BlockStack>
              </Card>
            </InlineGrid>

            <Divider />

            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingMd">Videos Performance</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Select
                    label="Carousel"
                    labelHidden
                    options={carouselOptions}
                    value={videoCarouselFilter}
                    onChange={(value) => {
                      setVideoCarouselFilter(value);
                      setVideoPage(1);
                    }}
                  />
                  <Button
                    onClick={() =>
                      exportCsv(sortedVideos, "vinci-videos", [
                        { label: "Thumbnail", value: (row) => row.thumbnailUrl || "" },
                        { label: "Title", value: (row) => row.title },
                        { label: "Tagged Product Count", value: (row) => row.taggedProductCount },
                        { label: "Views", value: (row) => row.views },
                        { label: "Completion Rate", value: (row) => formatPercent(row.completionRate) },
                        { label: "Product Tap Rate", value: (row) => formatPercent(row.productTapRate) },
                        { label: "Attributed Revenue", value: (row) => row.attributedRevenue.toFixed(2) },
                      ])
                    }
                  >
                    Export CSV
                  </Button>
                </InlineStack>
              </InlineStack>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {[
                        { key: "thumbnail", label: "Thumbnail", sortable: false },
                        { key: "title", label: "Title", sortable: true },
                        { key: "taggedProductCount", label: "Tagged Products", sortable: true },
                        { key: "views", label: "Views", sortable: true },
                        { key: "completionRate", label: "Completion Rate", sortable: true },
                        { key: "productTapRate", label: "Product Tap Rate", sortable: true },
                        { key: "attributedRevenue", label: "Attributed Revenue", sortable: true },
                      ].map((column) => (
                        <th key={column.key} style={{ textAlign: "left", padding: "12px 8px", borderBottom: "1px solid #e1e3e5" }}>
                          {column.sortable ? (
                            <Button variant="plain" onClick={() => toggleSort(videoSort, column.key, setVideoSort)}>
                              {`${column.label}${sortArrow(videoSort, column.key)}`}
                            </Button>
                          ) : (
                            <Text as="span" variant="bodySm" tone="subdued">{column.label}</Text>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedVideos.map((video) => (
                      <tr key={video.id}>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>
                          {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt={video.title} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} /> : "—"}
                        </td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{video.title}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{video.taggedProductCount}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{video.views}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{formatPercent(video.completionRate)}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{formatPercent(video.productTapRate)}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{formatCurrency(video.attributedRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">
                  {`Showing ${paginatedVideos.length} of ${sortedVideos.length} videos`}
                </Text>
                <InlineStack gap="200">
                  <Button disabled={currentVideoPage <= 1} onClick={() => setVideoPage((page) => Math.max(1, page - 1))}>Previous</Button>
                  <Text as="span" variant="bodySm">{`Page ${currentVideoPage} of ${totalVideoPages}`}</Text>
                  <Button disabled={currentVideoPage >= totalVideoPages} onClick={() => setVideoPage((page) => Math.min(totalVideoPages, page + 1))}>Next</Button>
                </InlineStack>
              </InlineStack>
            </BlockStack>

            <Divider />

            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingMd">Top Products by Revenue</Text>
                <Button onClick={() => setShowAllTopProducts((value) => !value)}>
                  {showAllTopProducts ? "Show Top 10" : "Expand"}
                </Button>
              </InlineStack>
              <BlockStack gap="200">
                {topProductsByRevenue.length === 0 ? (
                  <Text as="p" variant="bodyMd" tone="subdued">No product data available for the selected filters.</Text>
                ) : (
                  topProductsByRevenue.map((product) => {
                    const maxRevenue = topProductsByRevenue[0]?.revenue || 1;
                    const width = Math.max(8, (product.revenue / maxRevenue) * 100);
                    return (
                      <InlineStack key={product.productId} blockAlign="center" gap="200">
                        {product.image ? <img src={product.image} alt={product.name} style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} /> : <Box minWidth="28px">—</Box>}
                        <Text as="span" variant="bodySm">{product.name}</Text>
                        <div style={{ flex: 1, background: "#f1f2f3", borderRadius: 4, overflow: "hidden", height: 12 }}>
                          <div style={{ width: `${width}%`, height: 12, background: "#0c66e4" }} />
                        </div>
                        <Text as="span" variant="bodySm">{formatCurrency(product.revenue)}</Text>
                      </InlineStack>
                    );
                  })
                )}
              </BlockStack>
            </BlockStack>

            <Divider />

            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingMd">Products Performance</Text>
                <InlineStack gap="200">
                  <Select
                    label="Carousel"
                    labelHidden
                    options={carouselOptions}
                    value={productCarouselFilter}
                    onChange={(value) => {
                      setProductCarouselFilter(value);
                      setProductVideoFilter("all");
                    }}
                  />
                  <Select
                    label="Video"
                    labelHidden
                    options={productVideoOptions}
                    value={productVideoFilter}
                    onChange={setProductVideoFilter}
                  />
                  <Button
                    onClick={() =>
                      exportCsv(productRows, "vinci-products", [
                        { label: "Product Image", value: (row) => row.image || "" },
                        { label: "Product Name", value: (row) => row.name },
                        { label: "Appearances", value: (row) => row.appearances },
                        { label: "Tag Taps", value: (row) => row.tagTaps },
                        { label: "ATC Clicks", value: (row) => row.atcClicks },
                        { label: "Orders", value: (row) => row.orders },
                        { label: "Revenue", value: (row) => row.revenue.toFixed(2) },
                      ])
                    }
                  >
                    Export CSV
                  </Button>
                </InlineStack>
              </InlineStack>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {[
                        { key: "image", label: "Image", sortable: false },
                        { key: "name", label: "Product Name", sortable: true },
                        { key: "appearances", label: "Appearances", sortable: true },
                        { key: "tagTaps", label: "Tag Taps", sortable: true },
                        { key: "atcClicks", label: "ATC Clicks", sortable: true },
                        { key: "orders", label: "Orders", sortable: true },
                        { key: "revenue", label: "Revenue", sortable: true },
                      ].map((column) => (
                        <th key={column.key} style={{ textAlign: "left", padding: "12px 8px", borderBottom: "1px solid #e1e3e5" }}>
                          {column.sortable ? (
                            <Button variant="plain" onClick={() => toggleSort(productSort, column.key, setProductSort)}>
                              {`${column.label}${sortArrow(productSort, column.key)}`}
                            </Button>
                          ) : (
                            <Text as="span" variant="bodySm" tone="subdued">{column.label}</Text>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {productRows.map((product) => (
                      <tr key={product.productId}>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>
                          {product.image ? <img src={product.image} alt={product.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} /> : "—"}
                        </td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{product.name}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{product.appearances}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{product.tagTaps}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{product.atcClicks}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{product.orders}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f2f3" }}>{formatCurrency(product.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingLg">
                Setup Guide
              </Text>
              <Button onClick={() => setSetupExpanded((v) => !v)}>
                {setupExpanded ? "Collapse" : "Expand"}
              </Button>
            </InlineStack>

            <Text as="p" variant="bodyMd" tone="subdued">
              Complete setup steps to maximize your store&apos;s potential.
            </Text>

            <InlineGrid columns={["2fr", "5fr"]} gap="300">
              <Text as="span" variant="bodyMd">
                {completed} of {stepsDone.length} steps completed
              </Text>
              <ProgressBar progress={progress} size="small" />
            </InlineGrid>

            {setupExpanded ? (
              <BlockStack gap="200">
                {stepItems.map((step, index) => {
                  const isOpen = openedStepIndex === index;
                  return (
                    <Card key={step.title} background={index === 0 ? "bg-surface-secondary" : "bg-surface"}>
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <Box>
                              {step.done ? <Badge tone="success">Done</Badge> : <Badge tone="attention">Pending</Badge>}
                            </Box>
                            <Text as="h3" variant="headingMd">
                              {step.title}
                            </Text>
                          </InlineStack>
                          <Button variant="plain" onClick={() => setOpenedStepIndex(index)}>
                            {isOpen ? "Hide" : "Show"}
                          </Button>
                        </InlineStack>

                        {isOpen ? (
                          <BlockStack gap="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              {step.description}
                            </Text>
                            <InlineStack>
                              <Button url={step.href} variant={step.done ? "secondary" : "primary"}>
                                {step.done ? "Open" : step.ctaLabel}
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        ) : null}
                      </BlockStack>
                    </Card>
                  );
                })}
              </BlockStack>
            ) : null}
          </BlockStack>
        </Card>

        {progress < 100 ? (
          <Banner
            tone="info"
            title="Finish setup to unlock full analytics"
            action={{ content: "Go to Widgets", url: "/app/widgets" }}
          >
            <p>Publish your widgets and playlists to start tracking engagement and conversions.</p>
          </Banner>
        ) : null}
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
