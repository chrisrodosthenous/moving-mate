/** Whether a stored upload path points at a raster image previewable in `<img>`. */
export function isImageDocumentPath(url: string): boolean {
  return /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(url.trim());
}

/** Whether a stored upload path points at a PDF. */
export function isPdfDocumentPath(url: string): boolean {
  return /\.pdf(\?.*)?$/i.test(url.trim());
}

/** Resolve a relative `/uploads/...` path or absolute URL for same-origin display. */
export function resolveUploadUrl(path: string, base = ''): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return base + (trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
}
