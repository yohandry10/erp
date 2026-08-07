import json
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
SCREENSHOT = ROOT / "artifacts" / "qa" / "phase7-consolidacion-ui.png"
SESSION = {
    "user": {
        "id": "qa-user",
        "email": "qa@example.test",
        "nombre": "QA",
        "roles": ["ADMIN"],
        "tenant_id": "11111111-1111-4111-8111-111111111111",
        "is_super_admin": False,
    }
}

GROUP = {
    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "codigo": "GRUPO-QA",
    "nombre": "Grupo Andino QA",
    "moneda_presentacion": "PEN",
    "es_controladora": True,
    "miembros": [
        {"tenant_id": SESSION["user"]["tenant_id"], "estado": "ACTIVO", "es_controladora": True, "participacion": 100, "empresa": {"razon_social": "Controladora QA SAC", "moneda_defecto": "PEN"}},
        {"tenant_id": "22222222-2222-4222-8222-222222222222", "estado": "ACTIVO", "es_controladora": False, "participacion": 80, "empresa": {"razon_social": "Subsidiaria QA SAC", "moneda_defecto": "USD"}},
    ],
}
REPORT = {"id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "codigo": "ER-GESTION", "nombre": "Estado de resultados de gestión", "lineas": []}


def route_api(route):
    path = route.request.url.split("?", 1)[0].rstrip("/")
    if path.endswith("/api/auth/profile"):
        payload = SESSION["user"]
    elif path.endswith("/api/configuration/context/country"):
        payload = {"success": True, "data": {"pais_id": 1, "pais": "PE", "monedaDefecto": "PEN"}}
    elif path.endswith("/api/contabilidad/consolidacion/grupos"):
        payload = {"success": True, "data": [GROUP]}
    elif path.endswith("/api/contabilidad/reportes-configurables"):
        payload = {"success": True, "data": [REPORT]}
    elif path.endswith("/generar"):
        payload = {"success": True, "data": {"reporte": REPORT, "alcance": "CONSOLIDADO", "empresas_incluidas": 2, "moneda_presentacion": "PEN", "lineas": [
            {"codigo": "INGRESOS", "nombre": "Ingresos", "valor": 125000.25},
            {"codigo": "GASTOS", "nombre": "Gastos", "valor": 74000.10},
            {"codigo": "RESULTADO", "nombre": "Resultado del período", "valor": 51000.15},
        ]}}
    else:
        payload = {"success": True, "data": []}
    route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))


def route_browser_request(route):
    """Intercepta las llamadas API tanto con proxy /backend como directas a /api."""
    url = route.request.url.split("?", 1)[0]
    if "/api/" in url:
        route_api(route)
    else:
        route.continue_()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1600, "height": 1000})
    context.add_cookies([
        {"name": "access_token", "value": "qa-cookie", "url": "http://127.0.0.1:3010"}
    ])
    context.add_init_script(
        "localStorage.setItem('erp.auth.session.snapshot', %s)" % json.dumps(json.dumps(SESSION))
    )
    page = context.new_page()
    page.route("**/*", route_browser_request)
    console_errors = []
    browser_requests = []
    failed_responses = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("request", lambda request: browser_requests.append(request.url) if "/api/" in request.url or "/backend/" in request.url else None)
    page.on("response", lambda response: failed_responses.append(f"{response.status} {response.url}") if response.status >= 400 else None)
    response = page.goto("http://127.0.0.1:3010/dashboard/contabilidad/consolidacion/", wait_until="domcontentloaded")
    if not response or response.status >= 400:
        raise AssertionError(
            f"La ruta no respondió correctamente: {getattr(response, 'status', None)}; "
            f"URL final: {page.url}; cookies: {context.cookies()}"
        )
    try:
        page.get_by_role("heading", name="Consolidación y reportes configurables").wait_for(timeout=15000)
    except Exception:
        print("URL_FINAL", page.url)
        print("BODY", page.locator("body").inner_text()[:1200])
        print("API_REQUESTS", browser_requests)
        print("CONSOLE_ERRORS", console_errors)
        print("FAILED_RESPONSES", failed_responses)
        raise
    page.get_by_text("Grupo Andino QA", exact=True).wait_for()
    page.get_by_text("Diseñador de reportes", exact=True).wait_for()
    page.get_by_role("button", name="Generar", exact=True).click()
    page.get_by_text("Resultado del período", exact=True).wait_for()
    page.screenshot(path=str(SCREENSHOT), full_page=True)
    if console_errors:
        raise AssertionError("Errores de consola: " + " | ".join(console_errors))
    print("OK_PHASE7_UI")
    print(SCREENSHOT)
    browser.close()
