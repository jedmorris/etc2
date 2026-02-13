"""
Compute RFM (Recency, Frequency, Monetary) Segments for a single user.
Runs weekly (Sunday 3 AM).
"""

import logging
from datetime import datetime, timedelta, timezone
from supabase_client import get_client

log = logging.getLogger(__name__)


def run(user_id: str) -> int:
    """Compute RFM scores and segments. Returns number of customers scored."""
    db = get_client()

    try:
        customers = (
            db.table("customers")
            .select("id, last_order_at, order_count, total_spent_cents")
            .eq("user_id", user_id)
            .gt("order_count", 0)
            .execute()
        )
    except Exception as e:
        log.error("Failed to fetch customers for RFM user=%s: %s", user_id, e)
        return 0

    rows = customers.data or []
    if not rows:
        return 0

    now = datetime.now(timezone.utc)

    # Calculate raw RFM values
    rfm_data = []
    for c in rows:
        last_order = c.get("last_order_at")
        if last_order:
            try:
                # Parse ISO timestamp, handle both "Z" and "+00:00" suffixes
                ts = datetime.fromisoformat(last_order.replace("Z", "+00:00"))
                # Ensure timezone-aware for comparison
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                days_since = (now - ts).days
            except (ValueError, TypeError):
                days_since = 365
        else:
            days_since = 365  # Default for unknown

        rfm_data.append({
            "id": c["id"],
            "recency_days": max(days_since, 0),
            "frequency": c.get("order_count", 0),
            "monetary": c.get("total_spent_cents", 0),
        })

    # Score 1-5 using quintiles
    def quintile_score(values: list[float], reverse: bool = False) -> list[int]:
        sorted_vals = sorted(set(values))
        if len(sorted_vals) <= 1:
            return [3] * len(values)
        n = len(sorted_vals)
        quintiles = [sorted_vals[int(n * i / 5)] for i in range(1, 5)]

        scores = []
        for v in values:
            score = 1
            for q in quintiles:
                if v > q:
                    score += 1
            if reverse:
                score = 6 - score  # Lower recency = better
            scores.append(score)
        return scores

    recency_scores = quintile_score([d["recency_days"] for d in rfm_data], reverse=True)
    frequency_scores = quintile_score([d["frequency"] for d in rfm_data])
    monetary_scores = quintile_score([d["monetary"] for d in rfm_data])

    scored = 0
    for i, d in enumerate(rfm_data):
        r, f, m = recency_scores[i], frequency_scores[i], monetary_scores[i]
        segment = _classify_segment(r, f, m)

        try:
            db.table("customers").update({
                "rfm_recency": r,
                "rfm_frequency": f,
                "rfm_monetary": m,
                "rfm_segment": segment,
            }).eq("id", d["id"]).execute()
            scored += 1
        except Exception as e:
            log.error("Failed to update RFM for customer=%s: %s", d["id"], e)

    return scored


def _classify_segment(r: int, f: int, m: int) -> str:
    """Classify customer into a named RFM segment."""
    avg = (r + f + m) / 3

    if r >= 4 and f >= 4 and m >= 4:
        return "champion"
    elif r >= 4 and f >= 3:
        return "loyal"
    elif r >= 4 and f <= 2:
        return "new"
    elif r >= 3 and f >= 3:
        return "promising"
    elif r <= 2 and f >= 4:
        return "at_risk"
    elif r <= 2 and f >= 2:
        return "needs_attention"
    elif r <= 2 and f <= 1:
        return "lost"
    elif avg >= 3.5:
        return "potential"
    else:
        return "hibernating"
