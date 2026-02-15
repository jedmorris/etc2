"""
Validate all required environment variables exist before Modal deploy.

Usage: python check_modal_env.py
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

REQUIRED_VARS = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
]

OPTIONAL_VARS = [
    "PRINTIFY_API_TOKEN",
    "ETSY_API_KEY",
    "ETSY_API_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "BEEHIIV_API_KEY",
    "BEEHIIV_WEBHOOK_SECRET",
    "SUBSTACK_EMAIL",
    "SUBSTACK_PASSWORD",
    "ENCRYPTION_KEY",
    "SLACK_WEBHOOK_URL",
]


def check() -> bool:
    missing_required = []
    missing_optional = []

    for var in REQUIRED_VARS:
        if not os.environ.get(var):
            missing_required.append(var)

    for var in OPTIONAL_VARS:
        if not os.environ.get(var):
            missing_optional.append(var)

    print("=== Modal Environment Check ===\n")

    if missing_required:
        print("MISSING REQUIRED:")
        for v in missing_required:
            print(f"  [x] {v}")
        print()
    else:
        print("All required vars present.\n")

    if missing_optional:
        print("MISSING OPTIONAL (features may be limited):")
        for v in missing_optional:
            print(f"  [ ] {v}")
        print()

    present = len(REQUIRED_VARS) + len(OPTIONAL_VARS) - len(missing_required) - len(missing_optional)
    total = len(REQUIRED_VARS) + len(OPTIONAL_VARS)
    print(f"Summary: {present}/{total} vars set")

    if missing_required:
        print("\nDeploy will FAIL without required vars.")
        print("\nTo set up Modal secrets:")
        print("  1. modal token set  (authenticate CLI)")
        print("  2. modal secret create etC2-secrets \\")
        for v in REQUIRED_VARS + OPTIONAL_VARS:
            val = os.environ.get(v, "")
            print(f'       {v}="{val[:3]}..." \\' if val else f"       {v}= \\")
        print("  3. modal deploy execution/modal_app.py")
        return False

    print("\nReady to deploy: modal deploy execution/modal_app.py")
    return True


if __name__ == "__main__":
    ok = check()
    sys.exit(0 if ok else 1)
