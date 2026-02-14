import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptToken } from "@/lib/utils/crypto";
import { cookies } from "next/headers";

const ETSY_API_URL = "https://api.etsy.com/v3";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const referer = request.headers.get("referer") || "";
  const isOnboarding = referer.includes("/onboarding");
  const redirectPath = isOnboarding ? "/app/onboarding" : "/app/settings";
  const redirectUrl = new URL(redirectPath, request.url);

  // Handle error from Etsy
  if (errorParam) {
    redirectUrl.searchParams.set("error", errorParam);
    return NextResponse.redirect(redirectUrl);
  }

  // Validate required params
  if (!code || !state) {
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

    // Validate state against stored CSRF token
    const cookieStore = await cookies();
    const storedState = cookieStore.get("etsy_oauth_state")?.value;
    const codeVerifier = cookieStore.get("etsy_code_verifier")?.value;

    if (!storedState || state !== storedState) {
      redirectUrl.searchParams.set("error", "invalid_state");
      return NextResponse.redirect(redirectUrl);
    }

    if (!codeVerifier) {
      redirectUrl.searchParams.set("error", "missing_verifier");
      return NextResponse.redirect(redirectUrl);
    }

    // Exchange authorization code for tokens using PKCE code verifier
    const tokenResponse = await fetch(
      `${ETSY_API_URL}/public/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: process.env.ETSY_API_KEY!,
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/callback/etsy`,
          code,
          code_verifier: codeVerifier,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Etsy token exchange failed:", errorBody);
      redirectUrl.searchParams.set("error", "token_exchange_failed");
      return NextResponse.redirect(redirectUrl);
    }

    const tokens = await tokenResponse.json();

    // Fetch the Etsy user/shop info
    const meResponse = await fetch(`${ETSY_API_URL}/application/users/me`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "x-api-key": process.env.ETSY_API_KEY!,
      },
    });

    let shopName: string | null = null;
    let shopId: string | null = null;

    if (meResponse.ok) {
      const meData = await meResponse.json();
      shopId = String(meData.user_id);
      shopName = meData.login_name || null;
    }

    // Encrypt tokens before storing
    const encryptedAccess = encryptToken(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : null;

    // Store encrypted tokens in connected_accounts
    const { error: upsertError } = await supabase
      .from("connected_accounts")
      .upsert(
        {
          user_id: user.id,
          platform: "etsy",
          platform_shop_id: shopId,
          platform_shop_name: shopName,
          status: "connected",
          access_token_encrypted: encryptedAccess,
          refresh_token_encrypted: encryptedRefresh,
          token_expires_at: new Date(
            Date.now() + tokens.expires_in * 1000
          ).toISOString(),
          scopes: tokens.scope ? tokens.scope.split(" ") : null,
        },
        { onConflict: "user_id,platform" }
      );

    if (upsertError) {
      console.error("Failed to store Etsy tokens:", upsertError);
      redirectUrl.searchParams.set("error", "storage_failed");
      return NextResponse.redirect(redirectUrl);
    }

    // Queue initial sync jobs for Etsy
    const now = new Date().toISOString();
    await supabase.from("sync_jobs").insert([
      { user_id: user.id, job_type: "etsy_orders", status: "queued", scheduled_at: now },
      { user_id: user.id, job_type: "etsy_listings", status: "queued", scheduled_at: now },
      { user_id: user.id, job_type: "etsy_payments", status: "queued", scheduled_at: now },
    ]);

    // Clear OAuth cookies
    const response = NextResponse.redirect(
      (() => {
        if (isOnboarding) {
          redirectUrl.searchParams.set("etsy_connected", "true");
          if (shopName) redirectUrl.searchParams.set("shop_name", shopName);
        } else {
          redirectUrl.searchParams.set("connected", "etsy");
        }
        return redirectUrl;
      })()
    );
    response.cookies.delete("etsy_code_verifier");
    response.cookies.delete("etsy_oauth_state");
    return response;
  } catch (error) {
    console.error("Etsy OAuth callback error:", error);
    redirectUrl.searchParams.set("error", "unexpected");
    return NextResponse.redirect(redirectUrl);
  }
}
