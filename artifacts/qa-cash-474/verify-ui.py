import json
import urllib.request

from playwright.sync_api import expect, sync_playwright


WEB_URL = "http://127.0.0.1:3024"
MOCK_URL = "http://127.0.0.1:43114"


def request_json(path: str, method: str = "GET") -> dict:
    data = b"{}" if method == "POST" else None
    request = urllib.request.Request(
        f"{MOCK_URL}{path}",
        data=data,
        method=method,
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


request_json("/__qa__/reset", "POST")
console_errors: list[str] = []
page_errors: list[str] = []

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    page.set_default_timeout(15_000)
    page.on(
        "console",
        lambda message: console_errors.append(message.text)
        if message.type == "error"
        else None,
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    page.goto(f"{WEB_URL}/login/")
    page.get_by_label("Correo Electrónico").fill("qa-cash-474@local.test")
    page.get_by_label("Contraseña").fill("CashVisual474!")
    page.get_by_role("button", name="Iniciar Sesión").click()
    page.wait_for_url("**/dashboard/")

    page.goto(f"{WEB_URL}/dashboard/cajas/")
    expect(page.get_by_role("heading", name="Gestión de Cajas")).to_be_visible()
    expect(page.get_by_text("Caja Principal QA 474", exact=True)).to_be_visible()

    def select_session() -> None:
        page.get_by_text("Caja Principal QA 474", exact=True).click()
        expect(page.get_by_role("heading", name="💰 Caja Principal QA 474")).to_be_visible()

    # Retiro: la UI falla cerrada antes de enviar si falta evidencia o destino.
    select_session()
    page.get_by_role("button", name="Retiro de Efectivo").click()
    page.get_by_role("spinbutton").fill("15")
    page.get_by_role("button", name="Registrar Retiro").click()
    expect(page.get_by_text("Debe ingresar la URL de la foto del comprobante")).to_be_visible()
    assert len(request_json("/__qa__/state")["requests"]) == 0
    page.get_by_placeholder("https://...").fill("https://evidencia.local/deposito-474.jpg")
    page.get_by_role("button", name="Registrar Retiro").click()
    expect(page.get_by_text("Seleccione la cuenta bancaria que recibirá el efectivo")).to_be_visible()
    assert len(request_json("/__qa__/state")["requests"]) == 0
    page.get_by_role("combobox", name="Cuenta bancaria destino").select_option(
        label="BCP · •••• 4740 · PEN"
    )
    page.get_by_placeholder("Detalle adicional...").fill("Depósito QA visual 474")
    page.get_by_role("button", name="Registrar Retiro").click()
    expect(page.get_by_role("heading", name="Sesiones de Caja")).to_be_visible()

    # Movimiento manual: una contrapartida de gasto es obligatoria.
    select_session()
    page.get_by_role("button", name="Ingreso/Gasto").click()
    page.get_by_role("combobox").nth(0).select_option(label="Gasto")
    page.get_by_role("spinbutton").fill("5")
    page.get_by_placeholder("Detalle del ingreso/gasto...").fill("Compra menor QA 474")
    page.get_by_role("button", name="Registrar", exact=True).click()
    expect(page.get_by_text("Seleccione la cuenta de gasto")).to_be_visible()
    assert len(request_json("/__qa__/state")["requests"]) == 1
    page.get_by_role(
        "combobox", name="Contrapartida contable del movimiento"
    ).select_option(label="65999 · Gastos operativos explícitos")
    page.get_by_role("button", name="Registrar", exact=True).click()
    expect(page.get_by_role("heading", name="Sesiones de Caja")).to_be_visible()

    # Abandono explícito: iniciar congela; cancelar confirma servidor y descongela.
    select_session()
    page.get_by_role("button", name="Cambio de Turno").click()
    page.get_by_role("combobox").select_option(label="María Turno Entrante")
    page.get_by_role("button", name="Continuar").click()
    expect(page.get_by_role("button", name="Cancelar cambio y descongelar caja")).to_be_visible()
    assert request_json("/__qa__/state")["state"]["frozen"] is True
    page.get_by_role("button", name="Cancelar cambio y descongelar caja").click()
    expect(page.get_by_role("dialog")).to_have_count(0)
    assert request_json("/__qa__/state")["state"]["frozen"] is False

    # Entrega completa: sólo la diferencia lleva movimiento y cuenta contable.
    page.get_by_role("button", name="Cambio de Turno").click()
    page.get_by_role("combobox").select_option(label="María Turno Entrante")
    page.get_by_role("button", name="Continuar").click()
    page.get_by_role("spinbutton").nth(1).fill("1")  # 1 billete de S/ 100
    page.get_by_role("button", name="Confirmar Arqueo").click()
    page.get_by_placeholder("Código de confirmación interno").nth(0).fill("saliente-474")
    page.get_by_placeholder("Código de confirmación interno").nth(1).fill("entrante-474")
    page.get_by_placeholder("https://...").fill("https://evidencia.local/arqueo-474.jpg")
    page.get_by_role(
        "combobox", name="Cuenta contable de diferencia de turno"
    ).select_option(label="75999 · Otros ingresos de gestión")
    expect(page.get_by_text("+S/ 20.00")).to_be_visible()
    page.get_by_role("button", name="Continuar", exact=True).click()
    expect(page.get_by_text("Sólo la diferencia del arqueo generará movimiento y asiento.")).to_be_visible()
    page.get_by_role("button", name="Confirmar y Salir").click()
    expect(page.get_by_role("heading", name="Sesiones de Caja")).to_be_visible()

    browser.close()

evidence = request_json("/__qa__/state")
state = evidence["state"]
requests = evidence["requests"]

assert state == {
    "balance": 100,
    "frozen": False,
    "shiftId": None,
    "movementCount": 1,
    "withdrawalCount": 1,
    "shiftStarts": 2,
    "shiftCancels": 1,
    "shiftCompletes": 1,
}
assert len(requests) == 6
assert all(len(item["key"]) >= 8 for item in requests)
assert len({item["key"] for item in requests}) == len(requests)

withdrawal = next(item for item in requests if "/retiros/" in item["path"])
manual = next(item for item in requests if "/movimientos/manual/" in item["path"])
complete = next(item for item in requests if "/completar/" in item["path"])
assert withdrawal["body"]["cuenta_bancaria_id"] == "47400000-0000-4000-8000-000000000201"
assert withdrawal["body"]["foto_comprobante"]
assert manual["body"]["cuenta_contrapartida_id"] == "47400000-0000-4000-8000-000000000303"
assert complete["body"]["cuenta_diferencia_id"] == "47400000-0000-4000-8000-000000000304"

assert not page_errors, f"Page errors: {page_errors}"
assert not console_errors, f"Console errors: {console_errors}"
print(
    "VERIFY_474_UI_OK: retiro/manual/cambio/cancelación completos; "
    "6 mutaciones con claves únicas, destinos explícitos, caja descongelada y sin errores de navegador"
)
