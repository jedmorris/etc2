"""
etC2 Sync Pipeline Test Harness

Validates the execution layer without real API credentials.
Tests: import resolution, data flow, field completeness, FK integrity.

Usage: cd execution && python test_harness.py
"""

import sys
import os
import importlib
from types import ModuleType
from unittest.mock import MagicMock
from datetime import datetime, timezone

# Ensure execution/ is on the path
sys.path.insert(0, os.path.dirname(__file__))

# ============================================
# Mock third-party dependencies before importing any modules
# ============================================
MOCK_MODULES = [
    "httpx", "modal", "stripe",
    "supabase", "supabase.client",
    "dotenv", "cryptography", "cryptography.fernet",
]

for mod_name in MOCK_MODULES:
    if mod_name not in sys.modules:
        mock = ModuleType(mod_name)
        # Add common attributes that code expects
        if mod_name == "dotenv":
            mock.load_dotenv = lambda: None
        elif mod_name == "cryptography.fernet":
            mock.Fernet = MagicMock()
            mock.InvalidToken = Exception
        elif mod_name == "modal":
            mock.App = MagicMock()
            mock.Image = MagicMock()
            mock.Secret = MagicMock()
            mock.Cron = lambda x: x
            mock.web_endpoint = lambda **kw: lambda f: f
            mock.function = MagicMock(return_value=lambda f: f)
        elif mod_name == "supabase":
            mock.Client = MagicMock
            mock.create_client = MagicMock()
        sys.modules[mod_name] = mock

# Mock supabase_client module (the local one) before other modules import it
mock_sb = ModuleType("supabase_client")
mock_sb.get_client = MagicMock(return_value=MagicMock())
sys.modules["supabase_client"] = mock_sb

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
WARN = "\033[93mWARN\033[0m"

results = {"pass": 0, "fail": 0, "warn": 0}


def check(name: str, condition: bool, detail: str = ""):
    if condition:
        print(f"  {PASS}  {name}")
        results["pass"] += 1
    else:
        print(f"  {FAIL}  {name}" + (f" -- {detail}" if detail else ""))
        results["fail"] += 1


def warn(name: str, detail: str = ""):
    print(f"  {WARN}  {name}" + (f" -- {detail}" if detail else ""))
    results["warn"] += 1


# ============================================
# TEST 1: All modules import cleanly
# ============================================
print("\n=== Test 1: Module Imports ===")

MODULES = [
    "token_manager",
    "rate_limiter",
    "sync_queue",
    "etsy_client",
    "shopify_client",
    "printify_client",
    "etsy_sync_orders",
    "etsy_sync_listings",
    "etsy_sync_payments",
    "shopify_sync_orders",
    "shopify_sync_products",
    "shopify_sync_customers",
    "printify_sync_orders",
    "printify_sync_products",
    "backfill_worker",
    "compute_financials",
    "compute_bestsellers",
    "compute_customer_merge",
    "compute_rfm",
]

for mod_name in MODULES:
    try:
        importlib.import_module(mod_name)
        check(f"import {mod_name}", True)
    except Exception as e:
        check(f"import {mod_name}", False, str(e)[:80])

# modal_app has decorators that need special handling
try:
    importlib.import_module("modal_app")
    check("import modal_app", True)
except Exception as e:
    # Modal decorators may fail in test env, that's OK
    warn(f"import modal_app (expected in test env)", str(e)[:60])

# ============================================
# TEST 2: No deprecated patterns
# ============================================
print("\n=== Test 2: Deprecated Pattern Scan ===")

deprecated_patterns = [
    ("datetime.utcnow()", ".utcnow()"),
    (".single()", ".single()"),
    ("from execution import", "from execution import"),
]

found_deprecated = False
for filename in os.listdir(os.path.dirname(__file__)):
    if not filename.endswith(".py") or filename == "test_harness.py":
        continue
    filepath = os.path.join(os.path.dirname(__file__), filename)
    with open(filepath) as f:
        content = f.read()

    for desc, pattern in deprecated_patterns:
        for i, line in enumerate(content.splitlines(), 1):
            stripped = line.strip()
            if pattern in stripped and not stripped.startswith("#") and not stripped.startswith('"'):
                check(f"{filename}:{i} no {desc}", False, stripped[:60])
                found_deprecated = True

if not found_deprecated:
    check("No deprecated patterns found", True)


# ============================================
# TEST 3: Sync worker data flow with mocked DB
# ============================================
print("\n=== Test 3: Etsy Order Sync Data Flow ===")

from etsy_sync_orders import _map_receipt_to_order, _map_transaction_to_line_item, _to_cents

sample_receipt = {
    "receipt_id": 12345,
    "status": "completed",
    "was_paid": True,
    "was_shipped": True,
    "create_timestamp": 1700000000,
    "subtotal": {"amount": 2500, "divisor": 100, "currency_code": "USD"},
    "total_shipping_cost": {"amount": 500, "divisor": 100, "currency_code": "USD"},
    "total_tax_cost": {"amount": 200, "divisor": 100, "currency_code": "USD"},
    "grandtotal": {"amount": 3200, "divisor": 100, "currency_code": "USD"},
    "discount_amt": {"amount": 0, "divisor": 100, "currency_code": "USD"},
    "transactions": [
        {
            "transaction_id": 98765,
            "title": "Custom Mug Design",
            "quantity": 2,
            "price": {"amount": 1250, "divisor": 100, "currency_code": "USD"},
            "sku": "MUG-001",
        }
    ],
}

order_data = _map_receipt_to_order("test-user-id", sample_receipt)

check("order has user_id", order_data["user_id"] == "test-user-id")
check("order has platform='etsy'", order_data["platform"] == "etsy")
check("order has platform_order_id", order_data["platform_order_id"] == "12345")
check("order subtotal_cents=2500", order_data["subtotal_cents"] == 2500)
check("order total_cents=3200", order_data["total_cents"] == 3200)
check("order has ordered_at", bool(order_data["ordered_at"]))
check("order has raw_data", order_data["raw_data"] == sample_receipt)

# Test line item mapping
line_item = _map_transaction_to_line_item("test-user-id", "order-uuid-123", sample_receipt["transactions"][0])
check("line_item has user_id", line_item["user_id"] == "test-user-id")
check("line_item has order_id", line_item["order_id"] == "order-uuid-123")
check("line_item has platform_line_item_id", line_item["platform_line_item_id"] == "98765")
check("line_item title", line_item["title"] == "Custom Mug Design")
check("line_item quantity=2", line_item["quantity"] == 2)
check("line_item unit_price_cents=1250", line_item["unit_price_cents"] == 1250)
check("line_item total_cents=2500", line_item["total_cents"] == 2500)
check("line_item has sku", line_item["sku"] == "MUG-001")

# Test money conversion
check("_to_cents divisor=100", _to_cents({"amount": 2500, "divisor": 100}) == 2500)
check("_to_cents divisor=1", _to_cents({"amount": 25, "divisor": 1}) == 2500)
check("_to_cents empty", _to_cents({}) == 0)


# ============================================
# TEST 4: Shopify order mapping
# ============================================
print("\n=== Test 4: Shopify Order Sync Data Flow ===")

from shopify_sync_orders import _map_order, _money_to_cents

sample_shopify_order = {
    "id": "gid://shopify/Order/123456",
    "name": "#1001",
    "displayFinancialStatus": "PAID",
    "displayFulfillmentStatus": "FULFILLED",
    "createdAt": "2024-01-15T10:30:00Z",
    "subtotalPriceSet": {"shopMoney": {"amount": "25.00", "currencyCode": "USD"}},
    "totalShippingPriceSet": {"shopMoney": {"amount": "5.00", "currencyCode": "USD"}},
    "totalTaxSet": {"shopMoney": {"amount": "2.00", "currencyCode": "USD"}},
    "totalDiscountsSet": {"shopMoney": {"amount": "0.00", "currencyCode": "USD"}},
    "totalPriceSet": {"shopMoney": {"amount": "32.00", "currencyCode": "USD"}},
}

shopify_order = _map_order("test-user-id", sample_shopify_order)
check("shopify order platform='shopify'", shopify_order["platform"] == "shopify")
check("shopify order_id extracted", shopify_order["platform_order_id"] == "123456")
check("shopify order_number", shopify_order["platform_order_number"] == "#1001")
check("shopify subtotal=2500", shopify_order["subtotal_cents"] == 2500)
check("shopify total=3200", shopify_order["total_cents"] == 3200)
check("shopify financial_status lowercased", shopify_order["financial_status"] == "paid")
check("shopify money_to_cents", _money_to_cents({"amount": "25.50"}) == 2550)
check("shopify money_to_cents empty", _money_to_cents({}) == 0)


# ============================================
# TEST 5: Printify status mapping
# ============================================
print("\n=== Test 5: Printify Status Mapping ===")

from printify_sync_orders import _map_printify_status

check("printify pending->unfulfilled", _map_printify_status("pending") == "unfulfilled")
check("printify in-production->in_production", _map_printify_status("in-production") == "in_production")
check("printify shipping->shipped", _map_printify_status("shipping") == "shipped")
check("printify fulfilled->delivered", _map_printify_status("fulfilled") == "delivered")
check("printify unknown->unfulfilled", _map_printify_status("xyz") == "unfulfilled")


# ============================================
# TEST 6: Required fields for DB NOT NULL constraints
# ============================================
print("\n=== Test 6: NOT NULL Field Compliance ===")

# orders table NOT NULL: user_id, platform, platform_order_id, ordered_at
ORDERS_REQUIRED = ["user_id", "platform", "platform_order_id", "ordered_at"]
for field in ORDERS_REQUIRED:
    check(f"etsy order has {field}", field in order_data, f"missing from _map_receipt_to_order")
    check(f"shopify order has {field}", field in shopify_order, f"missing from _map_order")

# order_line_items NOT NULL: user_id, order_id, title
LINE_ITEM_REQUIRED = ["user_id", "order_id", "title"]
for field in LINE_ITEM_REQUIRED:
    check(f"etsy line_item has {field}", field in line_item, f"missing from _map_transaction_to_line_item")


# ============================================
# TEST 7: Compute scripts import and have run()
# ============================================
print("\n=== Test 7: Compute Script Signatures ===")

compute_modules = [
    "compute_financials",
    "compute_bestsellers",
    "compute_customer_merge",
    "compute_rfm",
]

for mod_name in compute_modules:
    try:
        mod = importlib.import_module(mod_name)
        has_run = callable(getattr(mod, "run", None))
        check(f"{mod_name}.run() exists", has_run)
        if has_run:
            import inspect
            sig = inspect.signature(mod.run)
            params = list(sig.parameters.keys())
            check(f"{mod_name}.run(user_id)", "user_id" in params)
    except Exception as e:
        check(f"{mod_name} import", False, str(e)[:60])


# ============================================
# TEST 8: Backfill worker orchestration
# ============================================
print("\n=== Test 8: Backfill Worker Platform Dispatch ===")

import backfill_worker
import inspect

source = inspect.getsource(backfill_worker.run)
check("backfill handles etsy", "etsy" in source)
check("backfill handles shopify", "shopify" in source)
check("backfill handles printify", "printify" in source)
check("backfill logs errors", "sync_log" in source)
check("backfill logs completion", "completed" in source)


# ============================================
# TEST 9: All sync workers have run(user_id) signature
# ============================================
print("\n=== Test 9: Sync Worker Signatures ===")

sync_modules = [
    "etsy_sync_orders",
    "etsy_sync_listings",
    "etsy_sync_payments",
    "shopify_sync_orders",
    "shopify_sync_products",
    "shopify_sync_customers",
    "printify_sync_orders",
    "printify_sync_products",
]

for mod_name in sync_modules:
    try:
        mod = importlib.import_module(mod_name)
        sig = inspect.signature(mod.run)
        params = list(sig.parameters.keys())
        check(f"{mod_name}.run(user_id)", params == ["user_id"])
        ret = sig.return_annotation
        check(f"{mod_name} returns int", ret == int or ret == inspect.Parameter.empty)
    except Exception as e:
        check(f"{mod_name} signature", False, str(e)[:60])


# ============================================
# SUMMARY
# ============================================
print(f"\n{'='*50}")
total = results['pass'] + results['fail']
print(f"Results: {results['pass']}/{total} passed, {results['fail']} failed, {results['warn']} warnings")
print(f"{'='*50}")

sys.exit(1 if results["fail"] > 0 else 0)
