-- etC2: Safe migration - uses IF NOT EXISTS for all objects
-- Safe to run multiple times

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step TEXT NOT NULL DEFAULT 'connect_etsy',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_status TEXT NOT NULL DEFAULT 'active',
  monthly_order_count INTEGER NOT NULL DEFAULT 0,
  monthly_order_limit INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own profile" ON profiles;
CREATE POLICY "Users see own profile" ON profiles FOR ALL USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (user_id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- CONNECTED ACCOUNTS
-- ============================================
CREATE TABLE IF NOT EXISTS connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_shop_id TEXT,
  platform_shop_name TEXT,
  status TEXT NOT NULL DEFAULT 'connected',
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  last_sync_at TIMESTAMPTZ,
  sync_cursor JSONB DEFAULT '{}',
  error_message TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own connections" ON connected_accounts;
CREATE POLICY "Users see own connections" ON connected_accounts FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- CUSTOMERS
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  zip TEXT,
  etsy_customer_id TEXT,
  shopify_customer_id TEXT,
  printify_customer_id TEXT,
  order_count INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  average_order_cents INTEGER NOT NULL DEFAULT 0,
  first_order_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,
  rfm_recency INTEGER,
  rfm_frequency INTEGER,
  rfm_monetary INTEGER,
  rfm_segment TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own customers" ON customers;
CREATE POLICY "Users see own customers" ON customers FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(user_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_etsy ON customers(user_id, etsy_customer_id) WHERE etsy_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shopify ON customers(user_id, shopify_customer_id) WHERE shopify_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_printify ON customers(user_id, printify_customer_id) WHERE printify_customer_id IS NOT NULL;

-- ============================================
-- CUSTOMER NOTES
-- ============================================
CREATE TABLE IF NOT EXISTS customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own customer notes" ON customer_notes;
CREATE POLICY "Users see own customer notes" ON customer_notes FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- PRODUCTS
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  etsy_listing_id TEXT,
  shopify_product_id TEXT,
  printify_product_id TEXT,
  etsy_url TEXT,
  shopify_url TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  price_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  printify_blueprint_id TEXT,
  printify_provider_id TEXT,
  printify_production_cost_cents INTEGER,
  printify_shipping_cost_cents INTEGER,
  total_sales INTEGER NOT NULL DEFAULT 0,
  total_revenue_cents INTEGER NOT NULL DEFAULT 0,
  total_views INTEGER NOT NULL DEFAULT 0,
  total_favorites INTEGER NOT NULL DEFAULT 0,
  conversion_rate NUMERIC(5,4),
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data JSONB
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own products" ON products;
CREATE POLICY "Users see own products" ON products FOR ALL USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_etsy ON products(user_id, etsy_listing_id) WHERE etsy_listing_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shopify ON products(user_id, shopify_product_id) WHERE shopify_product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_printify ON products(user_id, printify_product_id) WHERE printify_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);

-- ============================================
-- ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_order_id TEXT NOT NULL,
  platform_order_number TEXT,
  customer_id UUID REFERENCES customers(id),
  status TEXT,
  financial_status TEXT,
  fulfillment_status TEXT,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  printify_production_cost_cents INTEGER,
  printify_shipping_cost_cents INTEGER,
  printify_order_id TEXT,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  transaction_fee_cents INTEGER NOT NULL DEFAULT 0,
  payment_processing_fee_cents INTEGER NOT NULL DEFAULT 0,
  listing_fee_cents INTEGER NOT NULL DEFAULT 0,
  profit_cents INTEGER,
  tracking_number TEXT,
  tracking_url TEXT,
  carrier TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  ordered_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data JSONB,
  UNIQUE(user_id, platform, platform_order_id)
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own orders" ON orders;
CREATE POLICY "Users see own orders" ON orders FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_ordered_at ON orders(user_id, ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_platform ON orders(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(user_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(user_id, updated_at DESC);

-- ============================================
-- ORDER LINE ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS order_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  sku TEXT,
  variant_title TEXT,
  platform_line_item_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own line items" ON order_line_items;
CREATE POLICY "Users see own line items" ON order_line_items FOR ALL USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_line_items_upsert ON order_line_items(user_id, order_id, platform_line_item_id);
CREATE INDEX IF NOT EXISTS idx_line_items_order ON order_line_items(order_id);
CREATE INDEX IF NOT EXISTS idx_line_items_product ON order_line_items(user_id, product_id);

-- ============================================
-- FULFILLMENT EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS fulfillment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  description TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  carrier TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data JSONB
);

ALTER TABLE fulfillment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own fulfillment events" ON fulfillment_events;
CREATE POLICY "Users see own fulfillment events" ON fulfillment_events FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fulfillment_order ON fulfillment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_user ON fulfillment_events(user_id, occurred_at DESC);

-- ============================================
-- ETSY LISTING STATS
-- ============================================
CREATE TABLE IF NOT EXISTS etsy_listing_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  favorites INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id, date)
);

ALTER TABLE etsy_listing_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own listing stats" ON etsy_listing_stats;
CREATE POLICY "Users see own listing stats" ON etsy_listing_stats FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_listing_stats_product ON etsy_listing_stats(user_id, product_id, date DESC);

-- ============================================
-- BESTSELLER CANDIDATES
-- ============================================
CREATE TABLE IF NOT EXISTS bestseller_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  score NUMERIC(8,2) NOT NULL DEFAULT 0,
  sales_velocity NUMERIC(8,4),
  margin_pct NUMERIC(5,2),
  consistency_score NUMERIC(5,2),
  pipeline_stage TEXT NOT NULL DEFAULT 'candidate',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE bestseller_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own bestsellers" ON bestseller_candidates;
CREATE POLICY "Users see own bestsellers" ON bestseller_candidates FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- PLATFORM FEES
-- ============================================
CREATE TABLE IF NOT EXISTS platform_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  platform_ledger_entry_id TEXT,
  fee_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform_ledger_entry_id)
);

ALTER TABLE platform_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own fees" ON platform_fees;
CREATE POLICY "Users see own fees" ON platform_fees FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_platform_fees_order ON platform_fees(order_id);

-- ============================================
-- DAILY FINANCIALS
-- ============================================
CREATE TABLE IF NOT EXISTS daily_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  platform TEXT NOT NULL,
  order_count INTEGER NOT NULL DEFAULT 0,
  gross_revenue_cents INTEGER NOT NULL DEFAULT 0,
  shipping_revenue_cents INTEGER NOT NULL DEFAULT 0,
  tax_collected_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  cogs_cents INTEGER NOT NULL DEFAULT 0,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  transaction_fee_cents INTEGER NOT NULL DEFAULT 0,
  payment_processing_fee_cents INTEGER NOT NULL DEFAULT 0,
  listing_fee_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cost_cents INTEGER NOT NULL DEFAULT 0,
  net_revenue_cents INTEGER NOT NULL DEFAULT 0,
  profit_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date, platform)
);

ALTER TABLE daily_financials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own financials" ON daily_financials;
CREATE POLICY "Users see own financials" ON daily_financials FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_financials_user_date ON daily_financials(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_financials_user_platform_date ON daily_financials(user_id, platform, date DESC);

-- ============================================
-- MONTHLY P&L
-- ============================================
CREATE TABLE IF NOT EXISTS monthly_pnl (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  platform TEXT NOT NULL,
  order_count INTEGER NOT NULL DEFAULT 0,
  gross_revenue_cents INTEGER NOT NULL DEFAULT 0,
  total_fees_cents INTEGER NOT NULL DEFAULT 0,
  cogs_cents INTEGER NOT NULL DEFAULT 0,
  net_revenue_cents INTEGER NOT NULL DEFAULT 0,
  profit_cents INTEGER NOT NULL DEFAULT 0,
  margin_pct NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, year, month, platform)
);

ALTER TABLE monthly_pnl ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own pnl" ON monthly_pnl;
CREATE POLICY "Users see own pnl" ON monthly_pnl FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_monthly_pnl_user ON monthly_pnl(user_id, year DESC, month DESC);

-- ============================================
-- PRINTIFY PROVIDERS
-- ============================================
CREATE TABLE IF NOT EXISTS printify_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  provider_name TEXT,
  avg_production_days NUMERIC(4,1),
  avg_shipping_days NUMERIC(4,1),
  quality_rating NUMERIC(3,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider_id)
);

ALTER TABLE printify_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own providers" ON printify_providers;
CREATE POLICY "Users see own providers" ON printify_providers FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- SYNC JOBS
-- ============================================
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  records_processed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own sync jobs" ON sync_jobs;
CREATE POLICY "Users see own sync jobs" ON sync_jobs FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_queue ON sync_jobs(status, scheduled_at, priority DESC) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_sync_jobs_running ON sync_jobs(status, started_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_sync_jobs_user ON sync_jobs(user_id, created_at DESC);

-- ============================================
-- SYNC LOG
-- ============================================
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES sync_jobs(id),
  platform TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  records_synced INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own sync logs" ON sync_log;
CREATE POLICY "Users see own sync logs" ON sync_log FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sync_log_user ON sync_log(user_id, started_at DESC);

-- ============================================
-- RATE LIMIT TRACKING
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limit_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  platform TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(date, platform, user_id)
);

ALTER TABLE rate_limit_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON rate_limit_tracking;
CREATE POLICY "Service role only" ON rate_limit_tracking FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS idx_rate_limit_date ON rate_limit_tracking(date);

-- ============================================
-- DATABASE FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION increment_order_count(p_user_id UUID)
RETURNS VOID AS $$
  UPDATE profiles
  SET monthly_order_count = monthly_order_count + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id;
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reset_monthly_counts(p_user_id UUID)
RETURNS VOID AS $$
  UPDATE profiles
  SET monthly_order_count = 0,
      updated_at = NOW()
  WHERE user_id = p_user_id;
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION check_plan_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT monthly_order_count < monthly_order_limit
  FROM profiles WHERE user_id = p_user_id;
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- NEWSLETTER SUBSCRIBERS
-- ============================================
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  beehiiv_subscriber_id TEXT,
  beehiiv_status TEXT NOT NULL DEFAULT 'active',
  substack_status TEXT NOT NULL DEFAULT 'pending',
  tags JSONB DEFAULT '[]',
  segments JSONB DEFAULT '[]',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  beehiiv_created_at TIMESTAMPTZ,
  synced_to_substack_at TIMESTAMPTZ,
  last_webhook_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, email)
);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own newsletter subscribers" ON newsletter_subscribers;
CREATE POLICY "Users see own newsletter subscribers" ON newsletter_subscribers FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_newsletter_subs_user ON newsletter_subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_email ON newsletter_subscribers(user_id, email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_beehiiv ON newsletter_subscribers(user_id, beehiiv_subscriber_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_status ON newsletter_subscribers(user_id, substack_status);

-- Newsletter sync log
CREATE TABLE IF NOT EXISTS newsletter_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES newsletter_subscribers(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE newsletter_sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own newsletter sync log" ON newsletter_sync_log;
CREATE POLICY "Users see own newsletter sync log" ON newsletter_sync_log FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_newsletter_sync_log_user ON newsletter_sync_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_sync_log_sub ON newsletter_sync_log(subscriber_id);

-- ============================================
-- UPDATED_AT TRIGGERS (safe re-create)
-- ============================================
DROP TRIGGER IF EXISTS set_updated_at ON profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON connected_accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON connected_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON customers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON products;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON orders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON daily_financials;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON daily_financials FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON monthly_pnl;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON monthly_pnl FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON bestseller_candidates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bestseller_candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON printify_providers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON printify_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON newsletter_subscribers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
