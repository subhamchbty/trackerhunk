// Pure helpers for time and text formatting. No DOM, no state.

export const DAY_MS = 86400000;

export const pad = (n) => String(n).padStart(2, '0');

export function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Midnight `n` days after the day containing `ms`. Safe across DST changes. */
export function addDays(ms, n) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function today() {
  return startOfDay(Date.now());
}

/** "01:05:09" */
export function formatClock(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** "45m" or "1h 05m" */
export function formatShort(ms) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h === 0 ? `${m}m` : `${h}h ${pad(m)}m`;
}

/** "09:12" */
export function formatTime(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "09:12 – 09:37", with a day marker if the span ends on a later day. */
export function formatRange(start, end) {
  const extraDays = Math.round((startOfDay(end) - startOfDay(start)) / DAY_MS);
  const suffix = extraDays > 0 ? ` (+${extraDays}d)` : '';
  return `${formatTime(start)} – ${formatTime(end)}${suffix}`;
}

/** "Today", "Yesterday" or "Mon, 29 Sep". */
export function formatDayLabel(day) {
  const t = today();
  if (day === t) return 'Today';
  if (day === addDays(t, -1)) return 'Yesterday';
  const d = new Date(day);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

/** "YYYY-MM-DD" for a date input. */
export function toDateInput(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse "YYYY-MM-DD" as local midnight. NaN when empty or invalid. */
export function fromDateInput(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** "HH:MM:SS" for a time input with seconds. */
export function toTimeInput(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Combine a day (local midnight) with a time input value. NaN when invalid. */
export function fromTimeInput(day, value) {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value ?? '');
  if (!m) return NaN;
  const d = new Date(day);
  d.setHours(Number(m[1]), Number(m[2]), Number(m[3] ?? 0), 0);
  return d.getTime();
}

/** Hostname for display, e.g. "figma.com". */
export function linkLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

/** Add https:// when the user typed a bare domain. */
export function normalizeUrl(value) {
  const v = value.trim();
  if (!v) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}
