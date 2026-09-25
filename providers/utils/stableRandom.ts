export const DAILY_RANDOM_STALE_TIME_MS = 24 * 60 * 60 * 1000;

function localDayKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickDailyStableIndex(
  length: number,
  scope: string,
  now = new Date()
): number {
  if (!Number.isFinite(length) || length <= 1) return 0;
  return hashString(`${localDayKey(now)}:${scope}`) % Math.floor(length);
}

export function pickDailyStablePage(
  maxPage: number,
  scope: string,
  now = new Date()
): number {
  const normalizedMaxPage = Math.max(1, Math.floor(maxPage));
  return pickDailyStableIndex(normalizedMaxPage, scope, now) + 1;
}

export function pickDailyStableValue<T>(
  values: T[],
  scope: string,
  now = new Date()
): T | undefined {
  if (!values.length) return undefined;
  return values[pickDailyStableIndex(values.length, scope, now)];
}
