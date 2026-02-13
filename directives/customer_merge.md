# Customer Merge

## Goal
Deduplicate and merge customer records across Etsy, Shopify, and Printify into a unified customer profile, enabling cross-platform lifetime value tracking and marketing insights.

## Inputs
- `customers` table -- Raw customer records from each platform (etsy, shopify, printify)
- `orders` table -- Order data linking customers to purchases
- `connected_accounts` table -- Which platforms each user has connected

## Tools
- `execution/customer_merger.py` -- Matching, scoring, and merge logic
- `execution/sync_scheduler.py` -- Trigger nightly via Modal cron

## Steps

### 1. Nightly Trigger
- Runs nightly at **4:00 AM UTC**, staggered by user (after daily financial roll completes).
- Process users in batches.
- Only process users who have 2+ connected platforms (single-platform users have no cross-platform duplicates).

### 2. Gather Candidate Records
For each user, pull all customer records across platforms:
```
SELECT * FROM customers WHERE user_id = <user_id>
```
Each record contains (some fields may be null depending on platform):
- `platform` (etsy, shopify, printify)
- `platform_customer_id`
- `email`
- `first_name`, `last_name`
- `shipping_address` (street, city, state, zip, country)
- `order_count`, `total_spent`

### 3. Matching Rules (Priority Order)

#### Match Level 1: Exact Email (High Confidence)
- Normalize emails: lowercase, trim whitespace, strip `+` aliases (e.g. `john+etsy@gmail.com` -> `john@gmail.com`).
- If two records share the same normalized email, they are the same customer.
- Confidence: **1.0**

#### Match Level 2: Name + Address (Medium Confidence)
- Normalize names: lowercase, trim, remove punctuation.
- Normalize addresses: lowercase, standardize abbreviations (St -> Street, Apt -> Apartment), remove unit/suite numbers for comparison.
- Match if ALL of the following:
  - `first_name` fuzzy match (Levenshtein distance <= 2 OR Jaro-Winkler >= 0.85)
  - `last_name` exact match (after normalization)
  - `zip` exact match
  - `country` exact match
- Confidence: **0.75**

#### Match Level 3: Name + Partial Address (Low Confidence)
- Same name matching as Level 2.
- Only `city` + `state` + `country` match (no zip or street).
- Confidence: **0.50**
- These are flagged for manual review; not auto-merged.

### 4. Merge Into Unified Profiles
For each match group (set of records deemed to be the same customer):

1. Create or update a row in `unified_customers`:
   ```
   {
     user_id,
     unified_customer_id,       -- Generated UUID
     primary_email,             -- From highest-confidence match
     first_name, last_name,     -- From most complete record
     shipping_address,          -- From most recent order
     platform_ids: {            -- JSONB map
       "etsy": "etsy_customer_123",
       "shopify": "shopify_customer_456",
       "printify": "printify_customer_789"
     },
     match_confidence,          -- Lowest confidence in the group
     total_orders,              -- SUM across platforms (deduplicated)
     total_spent,               -- SUM across platforms (using order-level dedup)
     lifetime_value,            -- total_spent - total_refunds
     first_order_date,          -- MIN across platforms
     last_order_date,           -- MAX across platforms
     platforms_active: ["etsy", "shopify"],  -- Which platforms they've ordered on
     merged_at: now()
   }
   ```

2. **Field priority** for merging:
   - Email: Prefer verified email (Shopify marks verification) > most recent > any.
   - Name: Prefer Shopify (structured first/last) > Etsy (may be combined) > Printify.
   - Address: Prefer most recent shipping address from any platform.

3. **Link back**: Update `customers` records with `unified_customer_id` foreign key.

### 5. Cross-Platform Order Deduplication
- The same order may appear as both an Etsy order and a Printify order. When computing `total_orders` and `total_spent` for a unified customer:
  - Count the **Etsy order** as the revenue source.
  - Do not double-count the Printify fulfillment as a separate order.
  - Match via `orders.external_id` linking.

### 6. Incremental Processing
- Track `customers.merged_at` to avoid reprocessing already-merged records.
- On each run, only process:
  - New customer records (created since last run).
  - Updated customer records (email or address changed).
  - Existing unified profiles where a new platform record may match.

## Output
- `unified_customers` table with deduplicated, merged customer profiles.
- `customers` table updated with `unified_customer_id` back-references.
- Dashboard shows unified customer list with cross-platform activity.

## Notes / Edge Cases
- **No email from Etsy**: Etsy does not always provide buyer email (only if the seller has direct email access). In these cases, fall back to Name + Address matching only.
- **Privacy**: Customer data is sensitive. Never expose raw customer data in logs. The `unified_customers` table inherits RLS policies scoped to `user_id`.
- **Manual review queue**: Matches with confidence < 0.75 are flagged in a `merge_review` table for the user to manually confirm or reject from the dashboard.
- **Unmerge**: If a user marks a merge as incorrect, split the unified profile back into separate records and add a `do_not_merge` flag for that pair.
- **Guest checkouts**: Shopify guest checkouts may lack a `customer_id` but have email. Create a pseudo-customer record for matching purposes.
- **International addresses**: Address normalization is harder for non-US addresses. For MVP, apply basic normalization. Full international address parsing is a future enhancement.
- **Performance**: For users with 10K+ customers, the pairwise comparison is O(n^2). Optimize by:
  - First pass: exact email grouping (hash-based, O(n)).
  - Second pass: within unmatched records, group by `last_name + zip` and only fuzzy-match within groups.
- **GDPR/Data deletion**: If a customer requests deletion, remove them from `unified_customers` and all `customers` records. Propagate to analytics tables.
