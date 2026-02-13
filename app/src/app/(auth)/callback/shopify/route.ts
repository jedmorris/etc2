import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptToken } from "@/lib/utils/crypto";
import { cookies } from "next/headers";
import crypto from "crypto";

const WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "products/update",
  "products/delete",
  "app/uninstalled",
];

/**
 * Register webhooks with the Shopify store via REST API.
 * Fails silently — webhooks are also created via polling sync.
 */
async function registerShopifyWebhooks(
  shop: string,
  accessToken: string
): Promise<void> {
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/shopify`;

  for (const topic of WEBHOOK_TOPICS) {
    try {
      await fetch(
        `https://${shop}/admin/api/2024-10/webhooks.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            webhook: {
              topic,
              address: callbackUrl,
              format: "json",
            },
          }),
        }
      );
    } catch (err) {
      console.error(`Failed to register Shopify webhook ${topic}:`, err);
    }
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");
  const hmac = searchParams.get("hmac");

  const referer = request.headers.get("referer") || "";
  const isOnboarding = referer.includes("/onboarding");
  const redirectPath = isOnboarding ? "/app/onboarding" : "/app/settings";
  const redirectUrl = new URL(redirectPath, request.url);

  // Validate required params
  if (!code || !shop || !state) {
    redirectUrl.searchParams.set("error", "missing_params");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const supabase = await createClient();

    // Verify the user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Validate CSRF state token
    const cookieStore = await cookies();
    const storedState = cookieStore.get("shopify_oauth_state")?.value;

    if (!storedState || state !== storedState) {
      redirectUrl.searchParams.set("error", "invalid_state");
      return NextResponse.redirect(redirectUrl);
    }

    // Validate HMAC signature from Shopify
    if (hmac) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("hmac");
      params.sort();
      const message = params.toString();
      const expectedHmac = crypto
        .createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
        .update(message)
        .digest("hex");
      if (hmac !== expectedHmac) {
        redirectUrl.searchParams.set("error", "invalid_hmac");
        return NextResponse.redirect(redirectUrl);
      }
    }

    // Exchange authorization code for a permanent access token
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.SHOPIFY_API_KEY!,
          client_secret: process.env.SHOPIFY_API_SECRET!,
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Shopify token exchange failed:", errorBody);
      redirectUrl.searchParams.set("error", "token_exchange_failed");
      return NextResponse.redirect(redirectUrl);
    }

    const tokens = await tokenResponse.json();

    // Fetch shop info
    const shopResponse = await fetch(
      `https://${shop}/admin/api/2024-10/shop.json`,
      { headers: { "X-Shopify-Access-Token": tokens.access_token } }
    );

    let shopName: string | null = shop.replace(".myshopify.com", "");
    if (shopResponse.ok) {
      const shopData = await shopResponse.json();
      shopName = shopData.shop?.name || shopName;
    }

    // Encrypt token before storing
    const encryptedToken = encryptToken(tokens.access_token);

    // Store tokens in connected_accounts
    const { error: upsertError } = await supabase
      .from("connected_accounts")
      .upsert(
        {
          user_id: user.id,
          platform: "shopify",
          platform_shop_id: shop,
          platform_shop_name: shopName,
          status: "connected",
          access_token_encrypted: encryptedToken,
          refresh_token_encrypted: null,
          token_expires_at: null, // Shopify tokens don't expire
          scopes: tokens.scope ? tokens.scope.split(",") : null,
        },
        { onConflict: "user_id,platform" }
      );

    if (upsertError) {
      console.error("Failed to store Shopify tokens:", upsertError);
      redirectUrl.searchParams.set("error", "storage_failed");
      return NextResponse.redirect(redirectUrl);
    }

    // Register webhooks (fire-and-forget, don't block redirect)
    registerShopifyWebhooks(shop, tokens.access_token).catch((err) =>
      console.error("Webhook registration failed:", err)
    );

    // Build success redirect and clear OAuth cookies
    if (isOnboarding) {
      redirectUrl.searchParams.set("shopify_connected", "true");
    } else {
      redirectUrl.searchParams.set("connected", "shopify");
    }
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete("shopify_oauth_state");
    response.cookies.delete("shopify_shop");
    return response;
  } catch (error) {
    console.error("Shopify OAuth callback error:", error);
    redirectUrl.searchParams.set("error", "unexpected");
    return NextResponse.redirect(redirectUrl);
  }
}
