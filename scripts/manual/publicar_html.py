"""Publica manual/*.md en un solo HTML legible e imprimible. Requiere markdown-it-py.

    python scripts/manual/publicar_html.py
    node scripts/manual/publicar-pdf.mjs
"""
import html
import re
from pathlib import Path

from markdown_it import MarkdownIt

MANUAL = Path(__file__).resolve().parents[2] / "manual"
SALIDA = MANUAL / "publicado"
PARTES = [
    ("MANUAL_DEL_PRODUCTO.md", "Manual funcional"),
    ("GUIAS_POR_ROL.md", "Guías por rol"),
    ("PROCESOS_EMPRESARIALES.md", "Procesos entre módulos"),
    ("GUIA_TECNICA_Y_OPERATIVA.md", "Guía técnica y operativa"),
    ("INVENTARIO_DE_PANTALLAS.md", "Inventario de pantallas"),
]
ESTILO = """
:root{color-scheme:light dark;--fondo:#fff;--texto:#1c2430;--suave:#566070;--linea:#d8dde4;--acento:#0b5cad;--franja:#f4f6f8}
@media (prefers-color-scheme:dark){:root{--fondo:#12161c;--texto:#e7ebf0;--suave:#a4adba;--linea:#2e3640;--acento:#7db8f5;--franja:#1a2028}}
*{box-sizing:border-box}
body{margin:0;background:var(--fondo);color:var(--texto);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--acento)}a:focus-visible{outline:2px solid var(--acento);outline-offset:2px}
.saltar{position:absolute;left:-999px}.saltar:focus{left:16px;top:16px;background:var(--fondo);padding:8px;z-index:2}
.marco{display:grid;grid-template-columns:300px minmax(0,1fr);max-width:1240px;margin:auto}
nav{position:sticky;top:0;height:100vh;overflow:auto;padding:24px 16px;border-right:1px solid var(--linea);font-size:14px}
nav h2{font-size:13px;margin:20px 0 6px;color:var(--suave);text-transform:uppercase;letter-spacing:.04em}
nav ul{list-style:none;margin:0;padding:0}nav li a{display:block;padding:5px 6px;text-decoration:none;border-radius:4px}nav li a:hover{background:var(--franja)}
main{padding:32px 40px;min-width:0}main>section+section{margin-top:56px;border-top:2px solid var(--linea);padding-top:32px}
article{max-width:76ch}h1{font-size:1.9rem;line-height:1.2}h2{font-size:1.4rem;line-height:1.3;margin-top:2.2em}h3{font-size:1.08rem;margin-top:1.7em}
table{display:block;overflow-x:auto;border-collapse:collapse;margin:1em 0;font-size:.94rem}th,td{border:1px solid var(--linea);padding:6px 10px;text-align:left;vertical-align:top}th{background:var(--franja)}
code{font:.88em ui-monospace,Consolas,monospace;background:var(--franja);padding:1px 4px;border-radius:3px;overflow-wrap:anywhere}
@media (max-width:820px){.marco{display:block}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--linea);padding:16px}main{padding:16px}}
@media print{:root{--fondo:#fff;--texto:#000;--suave:#333;--linea:#999;--acento:#000;--franja:#eee}nav,.saltar{display:none}.marco{display:block;max-width:none}main{padding:0}article{max-width:none}table{display:table;page-break-inside:auto}tr{page-break-inside:avoid}h1,h2,h3{page-break-after:avoid}main>section{page-break-before:always}}
"""


def slug(texto, prefijo):
    limpio = re.sub(r"[^a-z0-9áéíóúñü]+", "-", texto.lower()).strip("-")
    return f"{prefijo}-{limpio}"


def main():
    md = MarkdownIt("commonmark", {"html": False}).enable("table")
    secciones, indice = [], []
    for n, (archivo, titulo) in enumerate(PARTES):
        cuerpo = md.render((MANUAL / archivo).read_text(encoding="utf8"))
        entradas = []

        def ancla(m):
            texto = re.sub(r"<[^>]+>", "", m.group(1))
            id_ = slug(texto, f"p{n}")
            entradas.append((id_, texto))
            return f'<h2 id="{id_}">{m.group(1)}</h2>'

        cuerpo = re.sub(r"<h2>(.*?)</h2>", ancla, cuerpo)
        # Lo publicado aquí se enlaza dentro de este HTML; el resto, a su archivo.
        incluidos = {a[:-3] for a, _ in PARTES}
        cuerpo = re.sub(
            r'href="([A-Z_]+)\.md"',
            lambda m: f'href="#parte-{m.group(1)}"' if m.group(1) in incluidos else f'href="../{m.group(1)}.md"',
            cuerpo,
        )
        secciones.append(f'<section id="parte-{archivo[:-3]}"><article>{cuerpo}</article></section>')
        enlaces = "".join(f'<li><a href="#{i}">{t}</a></li>' for i, t in entradas)
        indice.append(f"<h2>{html.escape(titulo)}</h2><ul>{enlaces}</ul>")
    SALIDA.mkdir(exist_ok=True)
    (SALIDA / "MANUAL_DEL_PRODUCTO.html").write_text(
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>Manual del ERP</title><style>{ESTILO}</style></head><body>"
        '<a class="saltar" href="#contenido">Saltar al contenido</a><div class="marco">'
        f'<nav aria-label="Índice">{"".join(indice)}</nav>'
        f'<main id="contenido">{"".join(secciones)}</main></div></body></html>\n',
        encoding="utf8",
    )


if __name__ == "__main__":
    main()
