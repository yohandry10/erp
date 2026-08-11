from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(r"C:\Users\PC\Desktop\erp")
BASE_URL = "http://127.0.0.1:14631"
API_URL = "http://127.0.0.1:14632"
TENANT_ID = "47200000-0000-4000-8000-000000000001"
ACTOR_ID = "47200000-0000-4000-8000-000000000002"
ORIGIN_ID = "47200000-0000-4000-8000-000000000101"


def post_reset() -> None:
    request = urllib.request.Request(
        f"{API_URL}/__qa__/reset",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5):
        pass


def create_note(page, note_type: str, reason: str, description: str, amount: str) -> None:
    page.get_by_role("button", name="Nueva NC / ND").click()
    origin = page.get_by_test_id("referenced-note-origin")
    origin.wait_for(state="visible")
    assert origin.is_enabled(), "El comprobante origen quedó bloqueado en loading"
    assert origin.input_value() == ORIGIN_ID
    page.get_by_test_id("referenced-note-type").select_option(note_type)
    page.get_by_label("Motivo").select_option(reason)
    page.get_by_label("Sustento").fill(description)
    page.get_by_test_id("referenced-note-amount").fill(amount)
    page.get_by_test_id("create-referenced-note").click()
    page.get_by_role("heading", name="Nueva nota referenciada").wait_for(state="hidden")


def main() -> None:
    post_reset()
    console_errors: list[str] = []
    output = ROOT / "artifacts" / "qa-referenced-notes-472" / "referenced-notes-flow.png"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        context.add_cookies(
            [
                {
                    "name": "access_token",
                    "value": "qa-notes-token-472",
                    "url": BASE_URL,
                    "httpOnly": True,
                    "sameSite": "Lax",
                }
            ]
        )
        page = context.new_page()
        session_user = {
            "id": ACTOR_ID,
            "tenant_id": TENANT_ID,
            "email": "qa-notes-472@local.test",
            "nombre": "QA",
            "apellido": "Notas 472",
            "roles": ["ADMIN"],
            "is_super_admin": False,
        }
        serialized_user = json.dumps(session_user, ensure_ascii=False)
        page.add_init_script(
            f"""
            (() => {{
              const user = {serialized_user};
              const session = JSON.stringify({{ user, access_token: 'qa-notes-token-472' }});
              localStorage.setItem('erp.auth.session.snapshot', session);
              sessionStorage.setItem('erp.auth.session.snapshot', session);
              localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']));
              localStorage.setItem('selectedCountry', '1');
            }})();
            """
        )
        page.on("dialog", lambda dialog: dialog.accept())
        page.on(
            "console",
            lambda message: console_errors.append(
                f"{message.text} @ {json.dumps(message.location, ensure_ascii=False)}"
            )
            if message.type == "error"
            else None,
        )
        page.on("pageerror", lambda error: console_errors.append(str(error)))

        page.goto(f"{BASE_URL}/dashboard/cpe/", wait_until="networkidle")
        page.get_by_role("heading", name="Comprobantes de Pago Electrónicos").wait_for()

        create_note(page, "07", "04", "Descuento comercial QA 472", "60.00")
        create_note(page, "08", "01", "Interés contractual QA 472", "15.00")

        credit_row = page.get_by_role("row").filter(has_text="Nota Crédito")
        credit_row.get_by_role("button", name="Firmar").click()
        credit_row.get_by_text("FIRMADO", exact=True).wait_for()
        credit_row.get_by_role("button", name="Enviar SUNAT").click()
        credit_row.get_by_text("ACEPTADO", exact=True).wait_for()

        debit_row = page.get_by_role("row").filter(has_text="Nota Débito")
        debit_row.get_by_text("BORRADOR", exact=True).wait_for()
        assert debit_row.get_by_role("button", name="Enviar SUNAT").is_disabled()
        page.screenshot(path=output, full_page=True)
        browser.close()

    with urllib.request.urlopen(f"{API_URL}/__qa__/state", timeout=5) as response:
        state = json.load(response)
    assert [(note["type"], note["state"]) for note in state["notes"]] == [
        ("07", "ACEPTADO"),
        ("08", "BORRADOR"),
    ]
    mutating_requests = [
        request
        for request in state["requests"]
        if "firmar" in request["path"]
        or "notas-referenciadas" == request["path"].split("/api/cpe/")[-1]
    ]
    assert mutating_requests
    assert all(request["key"] for request in mutating_requests)
    unexpected = [
        error for error in console_errors if f"{BASE_URL}/favicon.ico" not in error
    ]
    assert not unexpected, unexpected
    print("QA_REFERENCED_NOTES_472_OK")


if __name__ == "__main__":
    main()
