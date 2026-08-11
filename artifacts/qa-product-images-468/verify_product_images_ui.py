from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(r"C:\Users\PC\Desktop\erp")
BASE_URL = "http://127.0.0.1:14625"
STATE_URL = "http://127.0.0.1:14626/__qa__/state"
PRODUCT_ID = "46800000-0000-4000-8000-000000000003"
TENANT_ID = "46800000-0000-4000-8000-000000000001"
ACTOR_ID = "46800000-0000-4000-8000-000000000002"
IMAGE_PATH = ROOT / "apps" / "web" / "public" / "logo.png"
OUTPUT_DIR = ROOT / "artifacts" / "qa-product-images-468"


def open_editor(page) -> None:
    page.goto(
        f"{BASE_URL}/dashboard/inventario/productos/{PRODUCT_ID}/editar/",
        wait_until="networkidle",
    )
    if "/login" in page.url:
        raise AssertionError(f"La sesión QA no fue aceptada; URL actual: {page.url}")
    page.get_by_role("heading", name="Editar Producto").wait_for()


def save_product(page) -> None:
    page.get_by_role("button", name="Guardar Cambios").click()
    page.wait_for_url("**/dashboard/inventario/productos/", wait_until="networkidle")


def main() -> None:
    assert IMAGE_PATH.is_file(), f"No existe la imagen de prueba: {IMAGE_PATH}"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    console_errors: list[str] = []
    http_errors: list[tuple[int, str]] = []

    reset_request = urllib.request.Request(
        "http://127.0.0.1:14626/__qa__/reset",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(reset_request, timeout=5):
        pass

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1050})
        context.add_cookies(
            [
                {
                    "name": "access_token",
                    "value": "local-ui-token",
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
            "email": "qa-product-images-468@local.test",
            "nombre": "QA Imágenes 468",
            "roles": ["ADMIN"],
            "is_super_admin": False,
        }
        serialized_user = json.dumps(session_user, ensure_ascii=False)
        page.add_init_script(
            f"""
            (() => {{
              const user = {serialized_user};
              const session = JSON.stringify({{ user, access_token: 'local-ui-token' }});
              localStorage.setItem('erp.auth.session.snapshot', session);
              sessionStorage.setItem('erp.auth.session.snapshot', session);
              localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']));
              localStorage.setItem('selectedCountry', '1');
              localStorage.setItem('erp-dashboard-theme', 'dark');
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
        page.on(
            "response",
            lambda response: http_errors.append((response.status, response.url))
            if response.status >= 400
            else None,
        )

        open_editor(page)
        page.get_by_test_id("product-image-input").set_input_files(str(IMAGE_PATH))
        page.get_by_alt_text("Vista previa de la imagen del producto").wait_for()
        page.get_by_text("logo.png", exact=True).wait_for()
        page.screenshot(path=OUTPUT_DIR / "product-image-selected.png", full_page=True)
        save_product(page)

        thumbnail = page.get_by_alt_text("Imagen de Café visual 468")
        thumbnail.wait_for()
        assert thumbnail.get_attribute("src")
        page.screenshot(path=OUTPUT_DIR / "product-image-list.png", full_page=True)

        open_editor(page)
        page.get_by_test_id("product-image-input").set_input_files(str(IMAGE_PATH))
        page.get_by_role("button", name="Descartar cambio").wait_for()
        save_product(page)

        open_editor(page)
        page.get_by_role("button", name="Quitar imagen").click()
        page.get_by_text("La imagen actual se quitará al guardar los cambios.").wait_for()
        save_product(page)
        page.get_by_text("Café visual 468", exact=True).wait_for()
        assert page.get_by_alt_text("Imagen de Café visual 468").count() == 0
        page.screenshot(path=OUTPUT_DIR / "product-image-removed.png", full_page=True)

        browser.close()

    with urllib.request.urlopen(STATE_URL, timeout=5) as response:
        state = json.load(response)

    methods = [request["method"] for request in state["requests"]]
    assert methods.count("POST") == 2, methods
    assert methods.count("DELETE") == 1, methods
    assert all(request.get("key") for request in state["requests"]), state["requests"]
    assert state["product"]["imagen_url"] == "", state["product"]
    unexpected_console_errors = [
        error for error in console_errors if "http://127.0.0.1:14625/favicon.ico" not in error
    ]
    assert not http_errors, http_errors
    assert not unexpected_console_errors, unexpected_console_errors
    print("QA_PRODUCT_IMAGES_468_OK")


if __name__ == "__main__":
    main()
