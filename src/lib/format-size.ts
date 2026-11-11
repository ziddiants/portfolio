// File size text for download buttons (design-brand.md § Writing rules): whole KB below 1 MB
// ("118 KB"), one decimal from 1 MB ("1.1 MB"). 1 KB is 1000 bytes, as Finder shows it.
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    throw new Error(`formatSize: ${bytes} is not a file size in bytes`);
  }
  const kb = Math.max(1, Math.round(bytes / 1000));
  if (kb < 1000) return `${kb} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** "Résumé · PDF, 118 KB": the label of a download button. The ↓ is added by Button. */
export function downloadLabel(name: string, type: string, bytes: number): string {
  return `${name} · ${type}, ${formatSize(bytes)}`;
}
