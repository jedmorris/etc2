#!/usr/bin/env bash
# setup-stripe-test.sh — Create Stripe test products + prices for etC2
#
# Prerequisites:
#   1. stripe login  (authenticates the CLI)
#   2. Run this script: ./scripts/setup-stripe-test.sh
#
# This creates:
#   - 3 products (Starter, Growth, Pro)
#   - 3 recurring monthly prices
#   - Outputs env vars to paste into .env.local
#
# Usage: bash scripts/setup-stripe-test.sh

set -euo pipefail

echo "=== etC2 Stripe Test Setup ==="
echo ""

# Check Stripe CLI is authenticated
if ! stripe config --list &>/dev/null; then
  echo "ERROR: Stripe CLI not configured. Run 'stripe login' first."
  exit 1
fi

echo "Creating test products and prices..."
echo ""

# --- Starter Plan ($19/mo) ---
STARTER_PRODUCT=$(stripe products create \
  --name="etC2 Starter" \
  --description="Up to 300 orders/mo, 15-min sync, 90-day history" \
  --metadata[plan]=starter \
  --format=json | grep '"id"' | head -1 | sed 's/.*"id": "\(.*\)".*/\1/')

STARTER_PRICE=$(stripe prices create \
  --product="$STARTER_PRODUCT" \
  --unit-amount=1900 \
  --currency=usd \
  --recurring[interval]=month \
  --metadata[plan]=starter \
  --format=json | grep '"id"' | head -1 | sed 's/.*"id": "\(.*\)".*/\1/')

echo "✓ Starter: $STARTER_PRODUCT / $STARTER_PRICE"

# --- Growth Plan ($49/mo) ---
GROWTH_PRODUCT=$(stripe products create \
  --name="etC2 Growth" \
  --description="Up to 1500 orders/mo, 5-min sync, full history" \
  --metadata[plan]=growth \
  --format=json | grep '"id"' | head -1 | sed 's/.*"id": "\(.*\)".*/\1/')

GROWTH_PRICE=$(stripe prices create \
  --product="$GROWTH_PRODUCT" \
  --unit-amount=4900 \
  --currency=usd \
  --recurring[interval]=month \
  --metadata[plan]=growth \
  --format=json | grep '"id"' | head -1 | sed 's/.*"id": "\(.*\)".*/\1/')

echo "✓ Growth:  $GROWTH_PRODUCT / $GROWTH_PRICE"

# --- Pro Plan ($99/mo) ---
PRO_PRODUCT=$(stripe products create \
  --name="etC2 Pro" \
  --description="Up to 5000 orders/mo, 2-min sync, full history, all features" \
  --metadata[plan]=pro \
  --format=json | grep '"id"' | head -1 | sed 's/.*"id": "\(.*\)".*/\1/')

PRO_PRICE=$(stripe prices create \
  --product="$PRO_PRODUCT" \
  --unit-amount=9900 \
  --currency=usd \
  --recurring[interval]=month \
  --metadata[plan]=pro \
  --format=json | grep '"id"' | head -1 | sed 's/.*"id": "\(.*\)".*/\1/')

echo "✓ Pro:     $PRO_PRODUCT / $PRO_PRICE"

echo ""
echo "=== Add these to app/.env.local ==="
echo ""
echo "STRIPE_STARTER_PRICE_ID=$STARTER_PRICE"
echo "STRIPE_GROWTH_PRICE_ID=$GROWTH_PRICE"
echo "STRIPE_PRO_PRICE_ID=$PRO_PRICE"
echo ""
echo "=== Webhook Forwarding (run in separate terminal) ==="
echo ""
echo "stripe listen --forward-to localhost:3000/api/webhooks/stripe"
echo ""
echo "Then copy the webhook signing secret (whsec_...) to:"
echo "  STRIPE_WEBHOOK_SECRET=whsec_..."
echo ""
echo "Done! Products created in Stripe test mode."
