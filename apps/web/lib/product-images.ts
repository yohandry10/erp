type ApiCall = (
  endpoint: string,
  options?: RequestInit & { params?: Record<string, unknown> },
) => Promise<any>;

export async function uploadProductImage(
  apiCall: ApiCall,
  productId: string,
  file: File,
  idempotencyKey: string,
) {
  const body = new FormData();
  body.append("file", file, file.name);
  const response = await apiCall(`/inventario/productos/${productId}/imagen`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body,
  });
  if (!response?.success) {
    throw new Error(response?.message || "No se pudo subir la imagen del producto");
  }
  if (response?.data?.cleanup_pending) {
    throw new Error(
      "La imagen nueva ya está activa, pero la foto anterior sigue pendiente de limpieza. Vuelva a guardar para completar el borrado seguro.",
    );
  }
  return response;
}

export async function deleteProductImage(
  apiCall: ApiCall,
  productId: string,
  idempotencyKey: string,
) {
  const response = await apiCall(`/inventario/productos/${productId}/imagen`, {
    method: "DELETE",
    headers: { "Idempotency-Key": idempotencyKey },
  });
  if (!response?.success) {
    throw new Error(response?.message || "No se pudo eliminar la imagen del producto");
  }
  return response;
}
