import sys
import os
from pathlib import Path

# Add backend to sys.path
sys.path.append(str(Path(__file__).parent))

from app.core.config import get_settings
from app.services.email import send_email, _build_message, _transport_attempts
import smtplib
import ssl
import certifi
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

def test_sendgrid_sdk():
    settings = get_settings()
    if settings.sendgrid_api_key:
        print(f"Testing SendGrid SDK with Key: {settings.sendgrid_api_key[:10]}...")
    else:
        print("Testing SendGrid SDK with Key: None")
    if not settings.sendgrid_api_key:
        print("SKIP: No SendGrid API Key configured")
        return

    try:
        sg = SendGridAPIClient(api_key=settings.sendgrid_api_key)
        from_email = settings.smtp_from_email or "notifications@shedforge.com"
        from_name = settings.smtp_from_name or "ShedForge"
        
        message = Mail(
            from_email=(from_email, from_name),
            to_emails="test_recipient@example.com",
            subject="ShedForge SDK Test",
            plain_text_content="Test body",
        )
        print("Attempting to send via SDK...")
        # We don't want to actually send to a real user, but we can't easily dry-run with the SDK
        # giving a fake email might bounce, but API should accept it.
        # Actually, let's just use a dummy valid format.
        response = sg.send(message)
        print(f"SDK Result: Status {response.status_code}")
        print(f"SDK Body: {response.body}")
        print(f"SDK Headers: {response.headers}")
    except Exception as e:
        print(f"SDK FAILED: {e}")

def test_smtp():
    settings = get_settings()
    print(f"\nTesting SMTP with Host: {settings.smtp_host} Port: {settings.smtp_port} User: {settings.smtp_username}")
    
    if not settings.smtp_host:
        print("SKIP: No SMTP Host configured")
        return

    msg = _build_message(
        from_email=settings.smtp_from_email,
        from_name=settings.smtp_from_name,
        to_email="test_recipient@example.com",
        subject="ShedForge SMTP Test",
        text_content="Test body",
        html_content=None
    )

    ssl_context = ssl.create_default_context(cafile=certifi.where())
    
    try:
        print(f"Connecting to {settings.smtp_host}:{settings.smtp_port}...")
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            print("Connected. Starting TLS...")
            smtp.starttls(context=ssl_context)
            print("TLS established. Logging in...")
            smtp.login(settings.smtp_username, settings.smtp_password)
            print("Login success! Sending test email...")
            smtp.send_message(msg) 
            print("SMTP Send SUCCESS.")
    except Exception as e:
        print(f"SMTP FAILED: {e}")

if __name__ == "__main__":
    print("--- STARTING EMAIL DIAGNOSTICS ---")
    test_sendgrid_sdk()
    test_smtp()
    print("--- DIAGNOSTICS COMPLETE ---")
