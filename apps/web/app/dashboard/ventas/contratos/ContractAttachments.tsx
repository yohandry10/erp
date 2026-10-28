"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { Campo, control } from "./ContractForm";
import { Contrato } from "./types";

type FileRow = {
  id: string;
  nombre: string;
  bytes: number;
  recurso_tipo: string;
  recurso_id: string;
  sha256: string;
  estado: string;
  motivo_retiro?: string;
};
export function ContractAttachments({
  contrato,
  busy,
  manage,
  onSubmit,
}: {
  contrato: Contrato;
  busy: boolean;
  manage: boolean;
  onSubmit: (path: string, payload: object | FormData) => void;
}) {
  const { get } = useApi({ throwOnError: true, showErrorToast: false });
  const base = `/api/ventas/contratos/${contrato.id}/adjuntos`;
  const [rows, setRows] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"list" | "upload" | "retire">("list");
  const [target, setTarget] = useState(`CONTRATO:${contrato.id}`);
  const [file, setFile] = useState<File | null>(null);
  const [retiring, setRetiring] = useState<FileRow | null>(null);
  const [reason, setReason] = useState("");
  const [download, setDownload] = useState<{
    id: string;
    url: string;
    expiresAt: number;
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    let valid = true;
    setLoading(true);
    setError("");
    setDownload(null);
    void get(base)
      .then((r) => {
        if (valid) {
          setRows(r.data);
          setMode("list");
          setFile(null);
        }
      })
      .catch((e: Error) => {
        if (valid) setError(e.message);
      })
      .finally(() => {
        if (valid) setLoading(false);
      });
    return () => {
      valid = false;
    };
  }, [get, base, contrato.historial.length]);
  const name = (r: FileRow) =>
    r.recurso_tipo === "OC"
      ? `OC ${contrato.ordenes.find((o) => o.id === r.recurso_id)?.numero || "registrada"}`
      : r.recurso_tipo === "ADENDA"
        ? `Adenda ${contrato.historial.find((h) => h.id === r.recurso_id)?.referencia || "registrada"}`
        : r.recurso_tipo === "RECEPCION"
          ? `Recepción ${contrato.historial.find((h) => h.accion === "REGISTRAR_RECEPCION" && (h as { recurso_id?: string }).recurso_id === r.recurso_id)?.actual?.numero ?? "registrada"}`
          : "Contrato";
  return (
    <section
      className="space-y-4 border-t border-border pt-5"
      aria-label="Adjuntos del expediente"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Adjuntos del expediente</h3>
        {manage && mode === "list" && (
          <Button
            variant="outline"
            disabled={busy || loading || Boolean(error)}
            onClick={() => {
              setMode("upload");
              setFile(null);
            }}
          >
            Adjuntar documento
          </Button>
        )}
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">
        Archivos privados de contrato, OC, adendas y recepciones. PDF, DOCX sin macros, PNG o
        JPG; hasta 10 MB por archivo. Adjuntar no acredita firma ni aprobación
        legal.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error} Pulse Actualizar para volver a consultar.
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm">
          Cargando documentos…
        </p>
      ) : (
        !error &&
        !rows.length && (
          <p className="text-sm text-muted-foreground">
            Aún no hay documentos adjuntos.
          </p>
        )
      )}
      {mode === "upload" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            if (file.size <= 0 || file.size > 10485760) {
              setError("El archivo debe tener contenido y no superar 10 MB.");
              return;
            }
            setError("");
            const [recurso_tipo, recurso_id] = target.split(":");
            const body = new FormData();
            body.append("recurso_tipo", recurso_tipo);
            body.append("recurso_id", recurso_id);
            body.append("file", file);
            onSubmit(base, body);
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <Campo label="Documento asociado">
              <select
                aria-label="Documento asociado"
                className={control}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value={`CONTRATO:${contrato.id}`}>
                  Contrato {contrato.numero}
                </option>
                {contrato.ordenes.map((o) => (
                  <option key={o.id} value={`OC:${o.id}`}>
                    OC {o.numero}
                  </option>
                ))}
                {contrato.historial
                  .filter((h) => h.accion === "ADENDAR")
                  .map((h) => (
                    <option key={h.id} value={`ADENDA:${h.id}`}>
                      Adenda {h.referencia}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo label="Archivo del expediente">
              <Input
                aria-label="Archivo del expediente"
                type="file"
                required
                accept=".pdf,.docx,.png,.jpg,.jpeg"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </Campo>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !file}>
              Guardar adjunto
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setMode("list");
                setError("");
              }}
            >
              Cancelar adjunto
            </Button>
          </div>
        </form>
      )}
      {mode === "retire" && retiring && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(`${base}/${retiring.id}/retirar`, { motivo: reason });
          }}
        >
          <p className="text-sm font-medium">Retirar {retiring.nombre}</p>
          <p className="text-sm text-muted-foreground">
            Se conserva el registro y se bloquean nuevas descargas. Los enlaces
            ya emitidos vencen en un minuto.
          </p>
          <Campo label="Motivo de retiro del archivo">
            <textarea
              aria-label="Motivo de retiro del archivo"
              className={control}
              required
              minLength={5}
              maxLength={1000}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              Confirmar retiro de adjunto
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setMode("list")}
            >
              Conservar adjunto
            </Button>
          </div>
        </form>
      )}
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 py-3 text-sm">
            <p className="break-words font-medium">{r.nombre}</p>
            <p className="text-muted-foreground">
              {name(r)} ·{" "}
              {(Number(r.bytes) / 1024).toLocaleString("es-PE", {
                maximumFractionDigits: 1,
              })}{" "}
              KB · {r.estado === "RETIRADO" ? "Retirado" : "Disponible"}
            </p>
            {r.motivo_retiro && <p>{r.motivo_retiro}</p>}
            {r.estado === "DISPONIBLE" && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || preparing}
                  onClick={async () => {
                    setPreparing(true);
                    setError("");
                    setDownload(null);
                    try {
                      const response = await get(`${base}/${r.id}/descarga`);
                      setDownload({
                        id: r.id,
                        url: response.data.url,
                        expiresAt: Date.now() + 60000,
                      });
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setPreparing(false);
                    }
                  }}
                >
                  Obtener enlace de {r.nombre}
                </Button>
                {download?.id === r.id && (
                  <a
                    href={download.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                    onClick={(e) => {
                      if (Date.now() > download.expiresAt) {
                        e.preventDefault();
                        setDownload(null);
                        setError(
                          "El enlace venció. Obtenga uno nuevo para descargar el archivo.",
                        );
                      }
                    }}
                  >
                    Descargar {r.nombre}
                  </a>
                )}
                {manage && mode === "list" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setRetiring(r);
                      setReason("");
                      setMode("retire");
                    }}
                  >
                    Retirar {r.nombre}
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
