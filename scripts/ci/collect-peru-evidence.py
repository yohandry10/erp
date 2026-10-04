"""Exporta una lista explícita de evidencia funcional; nunca copia respaldos."""
import argparse
import io
import sys
import json
import re
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path


def github(endpoint):
    return subprocess.check_output(["gh", "api", endpoint])


parser = argparse.ArgumentParser()
source = parser.add_mutually_exclusive_group(required=True)
source.add_argument("--local", type=Path)
source.add_argument("--run-id", type=int)
parser.add_argument("--sha")
parser.add_argument("--artifact", choices=["peru-integrated-local", "peru-company-storage-local"], default="peru-integrated-local")
parser.add_argument("--output", required=True, type=Path)
args = parser.parse_args()
expected_scope = "company_logo_real_storage_subset" if args.artifact == "peru-company-storage-local" else "full"
root = Path(__file__).resolve().parents[2]
output = args.output.resolve()
if not output.is_relative_to(root / "artifacts"):
    raise RuntimeError("La salida debe estar dentro de artifacts")

provenance = {"dumps_extracted": False}
if args.local:
    directory = args.local.resolve()
    if not directory.is_relative_to(root / "artifacts"):
        raise RuntimeError("La fuente local debe estar dentro de artifacts")
    read = lambda name: (directory / name).read_bytes()
    provenance["local_source"] = directory.relative_to(root).as_posix()
else:
    if not args.sha or not re.fullmatch(r"[0-9a-f]{40}", args.sha):
        raise RuntimeError("CI exige el SHA exacto esperado")
    run_meta = json.loads(github(f"repos/yohandry10/erp/actions/runs/{args.run_id}"))
    if run_meta["head_sha"] != args.sha or run_meta["conclusion"] != "success":
        raise RuntimeError("El CI debe haber terminado con éxito para ese SHA")
    artifacts = json.loads(github(f"repos/yohandry10/erp/actions/runs/{args.run_id}/artifacts"))["artifacts"]
    matching = [item for item in artifacts if item["name"] == args.artifact and not item["expired"]]
    if not matching:
        raise RuntimeError("No existe un artefacto funcional vigente")
    candidates = []
    start = datetime.fromisoformat(run_meta["created_at"].replace("Z", "+00:00"))
    # Un rerun conserva también el artefacto del intento cancelado. Se inspeccionan
    # los JSON en memoria; ningún dump ni archivo del ZIP se extrae al disco.
    for item in matching:
        source_archive = zipfile.ZipFile(io.BytesIO(github(f"repos/yohandry10/erp/actions/artifacts/{item['id']}/zip")))
        for name in source_archive.namelist():
            if name.endswith("/run.json"):
                value = json.loads(source_archive.read(name))
                if value.get("success") is True and value.get("scope", "full") == expected_scope and value.get("remoteWrites") is False and value.get("withBrowser") is True:
                    when = datetime.fromisoformat(value["completedAt"].replace("Z", "+00:00"))
                    if when >= start:
                        candidates.append((when, item["id"], name.removesuffix("run.json"), item, source_archive))
    if not candidates:
        raise RuntimeError("No hay ejecución completa nueva para este CI")
    _, _, prefix, artifact, archive = max(candidates, key=lambda value: value[:3])
    read = lambda name: archive.read(prefix + name)
    provenance.update(github_run_id=args.run_id, github_artifact_id=artifact["id"],
                      head_sha=args.sha, selected_prefix=prefix,
                      github_run_attempt=run_meta["run_attempt"], inspected_artifact_ids=[item["id"] for item in matching])

run = json.loads(read("run.json"))
if expected_scope == "company_logo_real_storage_subset":
    selected = {"run.json": run, "company-logo.json": json.loads(read("company-logo.json")),
                "browser-company-logo.json": json.loads(read("browser-company-logo.json")),
                "restore.json": json.loads(read("backup/restore.json")),
                "storage-restore.json": json.loads(read("storage-restore.json"))}
    if any(value.get("success") is not True or value.get("remoteWrites") is not False for value in selected.values()):
        raise RuntimeError("Storage exige API, UI, DB y blobs restaurados aprobados sin escritura remota")
    provenance.update(selected_completed_at=run["completedAt"], scope=expected_scope,
                      limits=["Storage local real; no acredita proveedor remoto ni todas las variantes del logo"])
    selected["provenance.json"] = provenance
    safe = {}
    for name, value in selected.items():
        content = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
        if re.search(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----", content):
            raise RuntimeError(f"Material sensible en {name}")
        safe[name] = content
    output.mkdir(parents=True, exist_ok=True)
    for name, content in safe.items():
        with (output / name).open("w", encoding="utf-8", newline="") as file:
            file.write(content)
    print(json.dumps({"output": output.relative_to(root).as_posix(), "scope": expected_scope, "files": list(selected), "dumps_extracted": False}))
    sys.exit(0)
http = json.loads(read("http.json"))
if run.get("success") is not True or run.get("remoteWrites") is not False or run.get("scope", "full") != "full" or http.get("success") is not True:
    raise RuntimeError("Sólo se exportan ensayos completos aprobados sin escritura remota")
selected = {"run.json": run, "http.json": http, "restore.json": json.loads(read("backup/restore.json"))}
for name in ["browser-cxc-collection.json", "browser-inventory.json", "browser-rma-refund.json", "browser-manual-accounting.json", "browser-first-client-wizard.json", "browser-bank-finance.json", "browser-hr-lifecycle.json", "annual-acceptance.json", "finance-lifecycle.json", "hr-lifecycle.json", "hr-financial.json", "payroll-plame.json", "browser-hr-financial.json", "browser-payroll-plame.json", "configuration-admin.json", "browser-configuration-admin.json", "series-lifecycle.json", "tax-adjustments.json", "browser-tax-adjustments.json", "monthly-period.json", "tax-intents.json", "login-office.json", "browser-tax-monthly-intents.json", "browser-tax-annual-intents.json", "reports-consolidation-expanded.json", "browser-consignations.json", "browser-consolidation.json", "gre-operations.json", "browser-gre-print.json", "browser-gre-create.json", "browser-gre-recovery.json", "peru-navigation-admin.json", "pos-operations.json", "pos-worker-before.json", "browser-pos-recovery.json", "cpe-operations.json", "cpe-read-fault.json", "cpe-browser.json", "cash-operations.json", "cash-faults.json", "cash-accounting.json", "cash-browser.json", "cash-browser-accounting.json", "sales-operations.json"]:
    try:
        selected[name] = json.loads(read(name))
    except (FileNotFoundError, KeyError):
        pass
browser = re.sub(r"\x1b\[[0-9;]*m", "", read("browser.log").decode("utf-8", errors="replace"))
matches = re.findall(r"(?m)^\s*(\d+) passed\b", browser)
if not matches or re.search(r"(?m)^\s*\d+ failed\b", browser):
    raise RuntimeError("El navegador no registra finalización aprobada")
flaky = re.findall(r"(?m)^\s*(\d+) flaky\b", browser)
selected["browser-result.json"] = {"passed": int(matches[-1]), "failed": 0, "flaky": int(flaky[-1]) if flaky else 0,
                                   "scope": "Recorridos de peru-integrated-local.spec.ts; no acepta todas las acciones del producto"}
survey = json.loads(read("record-survey/survey.json"))
selected["record-survey-result.json"] = {"remoteWrites": False, "scope": survey["scope"],
    "missingFixtures": survey.get("missingFixtures", []), "findings": [
        {key: row[key] for key in ["template", "tenant", "status", "errors", "scriptErrors", "controls"] if key in row}
        for row in survey["findings"]]}
try:
    modules = json.loads(read("module-survey/survey.json"))
    selected["module-survey-result.json"] = {"remoteWrites": False, "scope": modules["scope"],
        "actor": modules["actor"], "excluded": modules.get("excluded", ["Analytics"]), "routes": [
            {key: row[key] for key in ["route", "finalUrl", "status", "errors", "expectedRestriction", "recovery", "controls"] if key in row}
            for row in modules["routes"]]}
except (FileNotFoundError, KeyError):
    pass
provenance["selected_completed_at"] = run["completedAt"]
selected["provenance.json"] = provenance
safe_contents = {}
for name, value in selected.items():
    content = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if re.search(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----", content):
        raise RuntimeError(f"Se detectó material sensible en {name}")
    safe_contents[name] = content
output.mkdir(parents=True, exist_ok=True)
for name, content in safe_contents.items():
    with (output / name).open("w", encoding="utf-8", newline="") as file:
        file.write(content)
print(json.dumps({"output": output.relative_to(root).as_posix(), "http_cases": len(http["results"]),
                  "browser_passed": selected["browser-result.json"]["passed"], "files": list(selected), "dumps_extracted": False}))
