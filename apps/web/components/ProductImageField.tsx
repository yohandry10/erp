"use client";

import Image from "next/image";
import { ImagePlus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type ProductImageFieldProps = {
  currentUrl?: string | null;
  file: File | null;
  removeCurrent?: boolean;
  disabled?: boolean;
  onFileChange: (file: File | null) => void;
  onRemoveCurrent?: () => void;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ProductImageField({
  currentUrl,
  file,
  removeCurrent = false,
  disabled = false,
  onFileChange,
  onRemoveCurrent,
}: ProductImageFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(removeCurrent ? null : currentUrl || null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [currentUrl, file, removeCurrent]);

  const selectFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(nextFile.type)) {
      setError("Use una imagen JPG, PNG o WebP.");
      return;
    }
    if (nextFile.size < 1 || nextFile.size > MAX_IMAGE_BYTES) {
      setError("La imagen debe pesar entre 1 byte y 5 MB.");
      return;
    }
    setError(null);
    onFileChange(nextFile);
  };

  const clearSelected = () => {
    setError(null);
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeImage = () => {
    clearSelected();
    onRemoveCurrent?.();
  };

  return (
    <section className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-bold text-foreground">Imagen del producto</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            JPG, PNG o WebP. Máximo 5 MB. La foto se mostrará también en el POS.
          </p>
        </div>
        <ImagePlus className="shrink-0 text-primary" aria-hidden="true" />
      </div>

      <input
        ref={inputRef}
        id={inputId}
        data-testid="product-image-input"
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => selectFile(event.target.files?.[0])}
      />

      <div
        data-testid="product-image-dropzone"
        className={`flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-4 text-center transition ${
          isDragging ? "border-primary bg-primary/10" : "border-border bg-muted/25"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!disabled) selectFile(event.dataTransfer.files?.[0]);
        }}
      >
        {previewUrl ? (
          <>
            <div className="relative size-36 overflow-hidden rounded-xl border border-border bg-background">
              <Image
                src={previewUrl}
                alt="Vista previa de la imagen del producto"
                fill
                unoptimized
                className="object-contain"
              />
            </div>
            <p className="m-0 max-w-full truncate text-sm font-medium">
              {file?.name || "Imagen actual"}
            </p>
          </>
        ) : (
          <>
            <Upload size={32} className="text-muted-foreground" aria-hidden="true" />
            <p className="m-0 text-sm text-muted-foreground">
              Arrastre una imagen aquí o selecciónela desde su equipo.
            </p>
          </>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          <label
            htmlFor={inputId}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground ${
              disabled ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-accent"
            }`}
          >
            {previewUrl ? <RefreshCw size={16} /> : <Upload size={16} />}
            {previewUrl ? "Cambiar imagen" : "Elegir imagen"}
          </label>
          {file && (
            <button
              type="button"
              disabled={disabled}
              onClick={clearSelected}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
            >
              Descartar cambio
            </button>
          )}
          {previewUrl && onRemoveCurrent && (
            <button
              type="button"
              disabled={disabled}
              onClick={removeImage}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-background px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
            >
              <Trash2 size={16} />
              Quitar imagen
            </button>
          )}
        </div>
      </div>

      {removeCurrent && !file && (
        <p className="mt-2 text-sm font-medium text-amber-600" role="status">
          La imagen actual se quitará al guardar los cambios.
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export default ProductImageField;
