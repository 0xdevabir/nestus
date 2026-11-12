import { formatDistanceToNowStrict } from 'date-fns';

export function formatBytes(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
  const exp = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const num = n / 1024 ** exp;
  const digits = exp === 0 ? 0 : num >= 10 ? 0 : 1;
  return `${num.toFixed(digits)} ${units[exp]}`;
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}
