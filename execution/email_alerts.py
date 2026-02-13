"""
Email alerts via Resend for sync failures and user notifications.
"""

import logging
import os

log = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "alerts@etc2.com")
APP_NAME = "etC2"


def send_sync_failure_alert(user_email: str, job_type: str, error_message: str):
    """Send an email alerting the user that a sync job failed."""
    if not RESEND_API_KEY:
        log.warning("RESEND_API_KEY not set, skipping email alert")
        return

    import resend
    resend.api_key = RESEND_API_KEY

    platform = job_type.split("_")[0].capitalize()
    subject = f"[{APP_NAME}] {platform} sync failed"

    html = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Sync Failure Alert</h2>
      <p>Your <strong>{platform}</strong> sync job (<code>{job_type}</code>) failed.</p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="color: #991b1b; margin: 0; font-size: 14px;"><strong>Error:</strong> {error_message[:300]}</p>
      </div>
      <p style="font-size: 14px; color: #6b7280;">
        We'll automatically retry on the next scheduled sync.
        If this persists, check your platform connection in
        <a href="https://app.etc2.com/app/settings">Settings</a>.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #9ca3af;">{APP_NAME} - POD Analytics for Etsy Sellers</p>
    </div>
    """

    try:
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": [user_email],
            "subject": subject,
            "html": html,
        })
        log.info("Sent sync failure alert to %s for %s", user_email, job_type)
    except Exception as e:
        log.error("Failed to send email alert to %s: %s", user_email, e)


def send_welcome_email(user_email: str, display_name: str | None = None):
    """Send a welcome email after signup."""
    if not RESEND_API_KEY:
        log.warning("RESEND_API_KEY not set, skipping welcome email")
        return

    import resend
    resend.api_key = RESEND_API_KEY

    name = display_name or "there"
    subject = f"Welcome to {APP_NAME}!"

    html = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Welcome to {APP_NAME}, {name}!</h2>
      <p>You're all set to start tracking your Etsy POD business.</p>
      <p><strong>Next steps:</strong></p>
      <ol style="line-height: 1.8;">
        <li>Connect your Etsy store</li>
        <li>Link your Printify account</li>
        <li>Watch your dashboard come to life</li>
      </ol>
      <a href="https://app.etc2.com/app/onboarding"
         style="display: inline-block; background: #18181b; color: white; padding: 12px 24px;
                border-radius: 6px; text-decoration: none; margin-top: 16px;">
        Get Started
      </a>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #9ca3af;">{APP_NAME} - POD Analytics for Etsy Sellers</p>
    </div>
    """

    try:
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": [user_email],
            "subject": subject,
            "html": html,
        })
        log.info("Sent welcome email to %s", user_email)
    except Exception as e:
        log.error("Failed to send welcome email to %s: %s", user_email, e)
