import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


USER = {
    "id": "qa-user",
    "email": "qa@example.test",
    "nombre": "QA",
    "roles": ["ADMIN"],
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "is_super_admin": False,
}

GROUP = {
    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "codigo": "GRUPO-QA",
    "nombre": "Grupo Andino QA",
    "moneda_presentacion": "PEN",
    "es_controladora": True,
    "miembros": [
        {
            "tenant_id": USER["tenant_id"],
            "estado": "ACTIVO",
            "es_controladora": True,
            "participacion": 100,
            "empresa": {
                "ruc": "20111111111",
                "razon_social": "Controladora QA SAC",
                "moneda_defecto": "PEN",
            },
        },
        {
            "tenant_id": "22222222-2222-4222-8222-222222222222",
            "estado": "ACTIVO",
            "es_controladora": False,
            "participacion": 80,
            "empresa": {
                "ruc": "20222222222",
                "razon_social": "Subsidiaria QA SAC",
                "moneda_defecto": "USD",
            },
        },
    ],
}

REPORT = {
    "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "codigo": "ER-GESTION",
    "nombre": "Estado de resultados de gestión",
    "lineas": [],
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def send_json(self, payload, status=200):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/")
        if path == "/api/auth/profile":
            return self.send_json(USER)
        if path == "/api/configuration/context/country":
            return self.send_json({"success": True, "data": {"pais_id": 1, "pais": "PE", "monedaDefecto": "PEN"}})
        if path == "/api/contabilidad/consolidacion/grupos":
            return self.send_json({"success": True, "data": [GROUP]})
        if path == "/api/contabilidad/reportes-configurables":
            return self.send_json({"success": True, "data": [REPORT]})
        if path.endswith("/generar") and "/api/contabilidad/reportes-configurables/" in path:
            return self.send_json({
                "success": True,
                "data": {
                    "reporte": REPORT,
                    "alcance": "CONSOLIDADO",
                    "empresas_incluidas": 2,
                    "moneda_presentacion": "PEN",
                    "lineas": [
                        {"codigo": "INGRESOS", "nombre": "Ingresos", "valor": 125000.25},
                        {"codigo": "GASTOS", "nombre": "Gastos", "valor": 74000.10},
                        {"codigo": "RESULTADO", "nombre": "Resultado del período", "valor": 51000.15},
                    ],
                },
            })
        if path.endswith("/permissions") or path.endswith("/notifications"):
            return self.send_json({"success": True, "data": []})
        return self.send_json({"success": True, "data": {}})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length:
            self.rfile.read(length)
        return self.send_json({"success": True, "data": REPORT})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4010), Handler).serve_forever()
