/** Human-readable byte sizes (binary units). */
export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  const sign = bytes < 0 ? '-' : '';
  let n = Math.abs(bytes);
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const fixed = i === 0 ? String(Math.round(n)) : n.toFixed(digits);
  return `${sign}${fixed} ${units[i]}`;
}

/** Format a 0–100 (or larger) percentage. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** Format a bit/byte rate. Pass bytesPerSecond; shows as B/s, KB/s, … */
export function formatRate(bytesPerSecond: number | null | undefined, digits = 1): string {
  if (bytesPerSecond == null || Number.isNaN(bytesPerSecond)) return '—';
  const abs = Math.abs(bytesPerSecond);
  if (abs < 1000) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (abs < 1_000_000) return `${(bytesPerSecond / 1000).toFixed(digits)} KB/s`;
  if (abs < 1_000_000_000) return `${(bytesPerSecond / 1_000_000).toFixed(digits)} MB/s`;
  return `${(bytesPerSecond / 1_000_000_000).toFixed(digits)} GB/s`;
}

/** Threshold helper for gauge/colors: ok < 75, warn < 90, else crit. */
export function utilizationLevel(pct: number | null | undefined): 'ok' | 'warn' | 'crit' | 'unknown' {
  if (pct == null || Number.isNaN(pct)) return 'unknown';
  if (pct >= 90) return 'crit';
  if (pct >= 75) return 'warn';
  return 'ok';
}
