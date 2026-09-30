"""Exporta una lista explícita de evidencia funcional; nunca copia respaldos."""
import argparse
import io
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
parser.add_argument("--output", required=True, type=Path)
args = parser.parse_args()
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
    matching = [item for item in artifacts if item["name"] == "peru-integrated-local" and not item["expired"]]
    if len(matching) != 1:
        raise RuntimeError("No existe un único artefacto funcional vigente")
    artifact = matching[0]
    archive = zipfile.ZipFile(io.BytesIO(github(f"repos/yohandry10/erp/actions/artifacts/{artifact['id']}/zip")))
    candidates = []
    for name in archive.namelist():
        if name.endswith("/run.json"):
            value = json.loads(archive.read(name))
            if value.get("success") is True and value.get("scope", "full") == "full" and value.get("remoteWrites") is False and value.get("withBrowser") is True:
                when = datetime.fromisoformat(value["completedAt"].replace("Z", "+00:00"))
                start = datetime.fromisoformat(run_meta["created_at"].replace("Z", "+00:00"))
                if when >= start:
                    candidates.append((when, name.removesuffix("run.json")))
    if not candidates:
        raise RuntimeError("No hay ejecución completa nueva para este CI")
    _, prefix = max(candidates)
    read = lambda name: archive.read(prefix + name)
    provenance.update(github_run_id=args.run_id, github_artifact_id=artifact["id"],
                      head_sha=args.sha, selected_prefix=prefix)

run = json.loads(read("run.json"))
http = json.loads(read("http.json"))
if run.get("success") is not True or run.get("remoteWrites") is not False or run.get("scope", "full") != "full" or http.get("success") is not True:
    raise RuntimeError("Sólo se exportan ensayos completos aprobados sin escritura remota")
selected = {"run.json": run, "http.json": http, "restore.json": json.loads(read("backup/restore.json"))}
for name in ["browser-cxc-collection.json", "browser-inventory.json", "browser-rma-refund.json", "peru-navigation-admin.json"]:
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
    (output / name).write_text(content, encoding="utf-8")
print(json.dumps({"output": output.relative_to(root).as_posix(), "http_cases": len(http["results"]),
                  "browser_passed": selected["browser-result.json"]["passed"], "files": list(selected), "dumps_extracted": False}))
