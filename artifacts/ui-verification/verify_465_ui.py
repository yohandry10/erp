import base64
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3001")
JWT_SECRET = os.environ.get("JWT_SECRET", "local-ui-465-secret")
ARTIFACT_DIR = Path(__file__).resolve().parent


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def jwt(user: dict) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(json.dumps({
        "sub": user["id"], "tenant_id": user["tenant_id"],
        "email": user["email"], "roles": user["roles"],
        "iat": int(time.time()), "exp": int(time.time()) + 3600,
    }, separators=(",", ":")).encode())
    signature = b64url(hmac.new(JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def main() -> None:
    user = {
        "id": "11111111-1111-4111-8111-111111111111",
        "email": "qa-465@erp.local",
        "nombre": "QA", "apellido": "Fiscal",
        "roles": ["ADMIN"], "tenant_id": "22222222-2222-4222-8222-222222222222",
        "is_super_admin": False,
    }
    cxc_id = "33333333-3333-4333-8333-333333333333"
    cxp_id = "44444444-4444-4444-8444-444444444444"
    client_id = "55555555-5555-4555-8555-555555555555"
    supplier_id = "66666666-6666-4666-8666-666666666666"
    bank_id = "77777777-7777-4777-8777-777777777777"
    pending_id = "88888888-8888-4888-8888-888888888888"
    operations = [{
        "id": pending_id, "origen": "PROVEEDOR", "tipo": "DETRACCION",
        "cxp_id": cxp_id, "monto": 120, "moneda": "PEN",
        "fecha": "2026-08-10", "referencia": "F001-900",
        "estado": "PENDIENTE_TESORERIA", "created_at": "2026-08-10T12:00:00Z",
    }]
    advances = [{
        "id": "99999999-9999-4999-8999-999999999999", "origen": "CLIENTE",
        "cliente_id": client_id, "monto_original": 500, "monto_disponible": 300,
        "moneda": "PEN", "fecha": "2026-08-09", "referencia": "ANT-CLI-001",
        "estado": "PARCIAL",
    }]
    mutations = []
    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        context = browser.new_context(viewport={"width": 1440, "height": 1050}, color_scheme="dark")
        context.add_cookies([{
            "name": "access_token", "value": jwt(user), "url": BASE_URL,
            "httpOnly": True, "sameSite": "Lax",
        }])
        page = context.new_page()
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        def fulfill(route, body, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(body))

        def api(route):
            request = route.request
            path = request.url.split("?", 1)[0]
            method = request.method
            if path.endswith("/api/auth/profile/") or path.endswith("/api/auth/profile"):
                return fulfill(route, user)
            if "/api/configuration/context/country" in path:
                return fulfill(route, {"data": {"pais_id": 1, "pais": "PE", "monedaDefecto": "PEN", "tipo_empresa": "MICRO", "requiresSetup": False}})
            if "/api/demo/status" in path:
                return fulfill(route, {"is_demo": False, "is_expired": False})
            if "/api/usuarios-sistema/me/permissions" in path:
                return fulfill(route, {"data": ["finanzas.read", "finanzas.write"]})
            if path.endswith("/api/retenciones") or path.endswith("/api/retenciones/"):
                return fulfill(route, {"success": True, "data": operations})
            if "/api/retenciones/anticipos" in path:
                if method == "GET":
                    return fulfill(route, {"success": True, "data": advances})
                body = request.post_data_json
                mutations.append({"path": path, "body": body})
                item = {
                    "id": str(uuid.uuid4()), "origen": body["origen"],
                    "cliente_id": body.get("cliente_id"), "proveedor_id": body.get("proveedor_id"),
                    "monto_original": body["monto"], "monto_disponible": body["monto"],
                    "moneda": body["moneda"], "fecha": body["fecha"],
                    "referencia": body.get("referencia"), "estado": "DISPONIBLE",
                }
                advances.insert(0, item)
                return fulfill(route, {"success": True, "data": item}, 201)
            if "/api/retenciones/ajustes" in path and method == "POST":
                body = request.post_data_json
                mutations.append({"path": path, "body": body})
                item = {
                    "id": str(uuid.uuid4()), "origen": body["origen"], "tipo": body["tipo"],
                    "cxc_id": body["cuenta_id"] if body["origen"] == "CLIENTE" else None,
                    "cxp_id": body["cuenta_id"] if body["origen"] == "PROVEEDOR" else None,
                    "monto": body["monto"], "moneda": body["moneda"], "fecha": body["fecha"],
                    "referencia": body.get("referencia"), "estado": "APLICADO",
                    "created_at": "2026-08-10T13:00:00Z",
                }
                operations.insert(0, item)
                return fulfill(route, {"success": True, "data": item}, 201)
            if "/depositar-detraccion" in path and method == "POST":
                body = request.post_data_json
                mutations.append({"path": path, "body": body})
                for item in operations:
                    if item["id"] in path:
                        item["estado"] = "APLICADO"
                return fulfill(route, {"success": True, "data": {"id": pending_id, "estado": "APLICADO"}})
            if "/api/finanzas/cxc" in path:
                return fulfill(route, {"success": True, "data": [{
                    "id": cxc_id, "cliente_id": client_id, "numero_documento": "F001-1200",
                    "monto_pendiente": 1180, "saldo": 1180, "moneda": "PEN", "estado": "PENDIENTE",
                }]})
            if "/api/finanzas/cxp" in path:
                return fulfill(route, {"success": True, "data": [{
                    "id": cxp_id, "proveedor_id": supplier_id, "numero_documento": "E001-450",
                    "saldo": 850, "moneda": "PEN", "estado": "PENDIENTE",
                }]})
            if "/api/ventas/clientes" in path:
                return fulfill(route, {"success": True, "data": [{"id": client_id, "razon_social": "Cliente Industrial SAC"}]})
            if "/api/compras/proveedores" in path:
                return fulfill(route, {"success": True, "data": [{"id": supplier_id, "razon_social": "Proveedor Logístico SAC"}]})
            if "/api/finanzas/bancos/cuentas" in path:
                return fulfill(route, {"success": True, "data": [{
                    "id": bank_id, "nombre": "Cuenta principal", "banco": "Banco de la Nación",
                    "moneda": "PEN", "saldo": 15000,
                }]})
            return fulfill(route, {"success": True, "data": []})

        page.route("**/api/**", api)
        serialized_user = json.dumps(user, ensure_ascii=False)
        page.add_init_script(f"""
          (() => {{
            const user = {serialized_user};
            const session = JSON.stringify({{ user, access_token: 'local-ui-token' }});
            localStorage.setItem('erp.auth.session.snapshot', session);
            sessionStorage.setItem('erp.auth.session.snapshot', session);
            localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']));
            localStorage.setItem('selectedCountry', '1');
            localStorage.setItem('erp-dashboard-theme', 'dark');
          }})();
        """)

        page.goto(f"{BASE_URL}/dashboard/finanzas/ajustes-fiscales/", wait_until="domcontentloaded", timeout=60000)
        page.get_by_role("heading", name="Ajustes fiscales y anticipos").wait_for(state="visible", timeout=60000)
        page.screenshot(path=str(ARTIFACT_DIR / "ajustes-fiscales-465-desktop.png"), full_page=True)

        page.locator("label:has-text('Documento con saldo') select").select_option(cxc_id)
        page.locator("label:has-text('Base (opcional)') input").fill("1000")
        page.locator("label:has-text('Tasa % (opcional)') input").fill("3")
        page.locator("label:has-text('Monto') input").fill("30")
        page.locator("label:has-text('Referencia') input").fill("RET-UI-465")
        page.get_by_role("button", name="Aplicar ajuste al documento").click()
        page.get_by_text("RET-UI-465").wait_for(state="visible", timeout=15000)

        page.get_by_role("button", name="Registrar anticipo", exact=True).click()
        page.locator("label:has-text('Origen') select").select_option("PROVEEDOR")
        page.locator("label").filter(has_text=re.compile(r"^Proveedor")).locator("select").select_option(supplier_id)
        page.locator("label:has-text('Cuenta bancaria') select").select_option(bank_id)
        page.locator("label:has-text('Monto') input").fill("250")
        page.locator("label:has-text('Referencia') input").fill("ANT-PROV-UI-465")
        page.get_by_role("button", name="Registrar movimiento y anticipo").click()
        page.get_by_text("ANT-PROV-UI-465").wait_for(state="visible", timeout=15000)

        page.locator("label:has-text('Banco para el depósito') select").select_option(bank_id)
        page.get_by_role("button", name="Depositar detracción").click()
        page.get_by_text("No hay detracciones pendientes.").wait_for(state="visible", timeout=15000)

        page.set_viewport_size({"width": 390, "height": 844})
        page.screenshot(path=str(ARTIFACT_DIR / "ajustes-fiscales-465-mobile.png"), full_page=True)
        overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
        if overflow:
            raise AssertionError("La página presenta overflow horizontal en viewport móvil")
        if len(mutations) != 3:
            raise AssertionError(f"Se esperaban 3 mutaciones UI y se observaron {len(mutations)}: {mutations}")
        if not mutations[0]["body"]["idempotency_key"].startswith("ajuste-fiscal-"):
            raise AssertionError("El ajuste no generó idempotency_key estable")
        if not mutations[1]["body"]["idempotency_key"].startswith("anticipo-"):
            raise AssertionError("El anticipo no generó idempotency_key")
        actionable = [message for message in console_errors if "favicon" not in message.lower()]
        if actionable:
            raise AssertionError(f"Errores de consola: {actionable}")
        print(json.dumps({
            "heading": "Ajustes fiscales y anticipos", "mutations": len(mutations),
            "desktop": str(ARTIFACT_DIR / "ajustes-fiscales-465-desktop.png"),
            "mobile": str(ARTIFACT_DIR / "ajustes-fiscales-465-mobile.png"),
            "horizontal_overflow": overflow, "console_errors": actionable,
        }, ensure_ascii=False))
        browser.close()


if __name__ == "__main__":
    main()
