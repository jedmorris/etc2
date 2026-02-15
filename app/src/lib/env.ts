const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TOKEN_ENCRYPTION_KEY",
] as const;

const OPTIONAL = [
  "RESEND_API_KEY",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_SENTRY_DSN",
] as const;

const isBuild = process.env.NEXT_PHASE === "phase-production-build";

const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0 && !isBuild) {
  const msg = `Missing required env vars: ${missing.join(", ")}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error(msg);
  }
  console.warn(`[env] ${msg}`);
}

if (!isBuild) {
  for (const key of OPTIONAL) {
    if (!process.env[key]) {
      console.warn(`[env] Optional env var not set: ${key}`);
    }
  }
}
