"""
Etsy Payment Sync Worker - syncs payment ledger entries for fee tracking.
"""

from etsy_client import EtsyClient
from supabase_client import get_client


def run(user_id: str) -> int:
    """Sync Etsy payment ledger entries. Returns number of records processed."""
    db = get_client()

    account = (
        db.table("connected_accounts")
        .select("sync_cursor")
        .eq("user_id", user_id)
        .eq("platform", "etsy")
        .maybe_single()
        .execute()
    )
    if not account.data:
        return 0
    cursor = account.data.get("sync_cursor", {}) or {}
    min_created = cursor.get("payments_last_ts")

    with EtsyClient(user_id) as client:
        all_entries = []
        offset = 0
        limit = 100

        while True:
            data = client.get_payments(min_created=min_created, limit=limit, offset=offset)
            results = data.get("results", [])
            all_entries.extend(results)
            if len(results) < limit:
                break
            offset += limit

    synced = 0
    latest_ts = min_created

    for entry in all_entries:
        # Map ledger entries to platform_fees
        fee_type = entry.get("entry_type", "unknown")
        amount = entry.get("amount", {})
        amount_cents = int(amount.get("amount", 0) * 100 / amount.get("divisor", 100))

        # Try to link to an order
        reference = entry.get("reference_id")

        ledger_entry_id = str(entry.get("payment_id") or entry.get("ledger_entry_id") or "")
        if not ledger_entry_id:
            continue

        fee_data = {
            "user_id": user_id,
            "platform_ledger_entry_id": ledger_entry_id,
            "fee_type": fee_type,
            "amount_cents": amount_cents,
            "currency": amount.get("currency_code", "USD"),
            "description": entry.get("description", ""),
        }

        if reference:
            # Look up order by receipt_id
            order = (
                db.table("orders")
                .select("id")
                .eq("user_id", user_id)
                .eq("platform", "etsy")
                .eq("platform_order_id", str(reference))
                .maybe_single()
                .execute()
            )
            if order.data:
                fee_data["order_id"] = order.data["id"]

        db.table("platform_fees").upsert(
            fee_data,
            on_conflict="user_id,platform_ledger_entry_id",
        ).execute()
        synced += 1

        created_ts = entry.get("create_date")
        if created_ts and (not latest_ts or created_ts > latest_ts):
            latest_ts = created_ts

    # Update cursor
    if latest_ts:
        db.table("connected_accounts").update({
            "sync_cursor": {**cursor, "payments_last_ts": latest_ts},
        }).eq("user_id", user_id).eq("platform", "etsy").execute()

    return synced
