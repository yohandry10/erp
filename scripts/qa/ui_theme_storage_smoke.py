"""Smoke visual dark/light y auditoría segura de Web Storage para DEV local."""

from __future__ import annotations

import json
import re
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
AUTH_STATE = ROOT / "apps" / "web" / "tests" / "e2e" / ".auth" / "admin.json"
ARTIFACTS = ROOT / "artifacts" / "ui-theme-smoke"
BASE_URL = "http://localhost:3001"
ROUTES = {
    "dashboard": "/dashboard/",
    "analytics": "/dashboard/analytics/",
    "documentos": "/dashboard/documentos/",
    "cpe": "/dashboard/cpe/",
    "reportes-ventas": "/dashboard/ventas/reportes/",
    "cotizaciones-nueva": "/dashboard/ventas/cotizaciones/nueva/",
    "pedidos": "/dashboard/ventas/pedidos/",
    "recepciones": "/dashboard/compras/recepciones/",
    "cxp": "/dashboard/finanzas/cxp/",
}

JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
SENSITIVE_NAME_RE = re.compile(
    r"(^|[_-])(access[_-]?token|refresh[_-]?token|authorization|password|passwd|secret|api[_-]?key)($|[_-])",
    re.IGNORECASE,
)


def audit_value(value: object, path: str, findings: list[str]) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if SENSITIVE_NAME_RE.search(str(key)) and child not in (None, "", False):
                findings.append(f"campo sensible con valor: {child_path}")
            audit_value(child, child_path, findings)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            audit_value(child, f"{path}[{index}]", findings)
    elif isinstance(value, str):
        if JWT_RE.search(value):
            findings.append(f"JWT persistido: {path}")
        if value.lower().startswith("bearer "):
            findings.append(f"Bearer persistido: {path}")


def audit_storage(entries: dict[str, str]) -> list[str]:
    findings: list[str] = []
    for key, raw in entries.items():
        if SENSITIVE_NAME_RE.search(key):
            findings.append(f"clave Web Storage sensible: {key}")
        try:
            audit_value(json.loads(raw), key, findings)
        except (TypeError, json.JSONDecodeError):
            audit_value(raw, key, findings)
    return sorted(set(findings))


def main() -> int:
    if not AUTH_STATE.exists():
        raise SystemExit(f"Falta storage state E2E: {AUTH_STATE}")
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    report: dict[str, object] = {
        "routes": [],
        "console_errors": [],
        "page_errors": [],
        "storage_keys": {},
        "storage_findings": [],
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            storage_state=str(AUTH_STATE),
            viewport={"width": 1440, "height": 1000},
            accept_downloads=True,
        )
        page = context.new_page()
        page.on(
            "console",
            lambda message: report["console_errors"].append(message.text)
            if message.type == "error"
            else None,
        )
        page.on(
            "pageerror",
            lambda error: report["page_errors"].append(
                {"message": str(error), "stack": getattr(error, "stack", None)}
            ),
        )

        for theme in ("dark", "light"):
            page.goto(f"{BASE_URL}/dashboard/", wait_until="domcontentloaded", timeout=30_000)
            page.evaluate("theme => localStorage.setItem('erp-dashboard-theme', theme)", theme)

            for name, route in ROUTES.items():
                response = page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded", timeout=30_000)
                try:
                    page.wait_for_load_state("networkidle", timeout=12_000)
                except PlaywrightTimeoutError:
                    pass
                page.wait_for_timeout(750)

                theme_state = page.evaluate(
                    """() => ({
                      layout: document.querySelector('[data-erp-theme]')?.getAttribute('data-erp-theme') || null,
                      html: document.documentElement.getAttribute('data-erp-theme'),
                      heading: document.querySelector('main h1')?.textContent?.trim() || null,
                      whiteLargeSurfaces: [...document.querySelectorAll('main *')].map((el) => {
                        const style = getComputedStyle(el);
                        const rect = el.getBoundingClientRect();
                        const rgb = style.backgroundColor.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
                        return rgb && rect.width * rect.height >= 20000 &&
                          Number(rgb[1]) >= 245 && Number(rgb[2]) >= 245 && Number(rgb[3]) >= 245
                          ? { tag: el.tagName, className: String(el.className || '').slice(0, 180), area: Math.round(rect.width * rect.height) }
                          : null;
                      }).filter(Boolean).slice(0, 12),
                    })"""
                )
                report["routes"].append(
                    {
                        "name": name,
                        "theme": theme,
                        "status": response.status if response else None,
                        **theme_state,
                    }
                )
                page.screenshot(
                    path=str(ARTIFACTS / f"{theme}-{name}.png"),
                    full_page=True,
                )

        storage = page.evaluate(
            """() => ({
              local: Object.fromEntries(Object.entries(localStorage)),
              session: Object.fromEntries(Object.entries(sessionStorage)),
            })"""
        )
        report["storage_keys"] = {
            "local": sorted(storage["local"].keys()),
            "session": sorted(storage["session"].keys()),
        }
        report["storage_findings"] = audit_storage(storage["local"]) + audit_storage(storage["session"])
        browser.close()

    report_path = ARTIFACTS / "report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    failed_routes = [
        route
        for route in report["routes"]
        if route["status"] != 200
        or route["layout"] != route["theme"]
        or route["html"] != route["theme"]
        or (route["theme"] == "dark" and route["whiteLargeSurfaces"])
    ]
    print(
        json.dumps(
            {
                "routes_checked": len(report["routes"]),
                "failed_routes": failed_routes,
                "console_error_count": len(report["console_errors"]),
                "page_error_count": len(report["page_errors"]),
                "storage_keys": report["storage_keys"],
                "storage_findings": report["storage_findings"],
                "report": str(report_path),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 1 if failed_routes or report["page_errors"] or report["storage_findings"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
