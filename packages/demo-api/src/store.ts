/**
 * Demo database: the seed exported from the real migrations + seed.sql,
 * kept in localStorage so the patient and doctor apps (same origin) share it.
 * Every read goes back to localStorage, so changes made in one tab show up in
 * another on the next request.
 */
import seed from './seed.json';

type Row = Record<string, any>;

export interface DemoDb {
  version: number;
  doctors: Row[];
  patients: Row[];
  checkins: Row[];
  alerts: Row[];
  messages: Row[];
  disease_protocols: Row[];
  call_sessions: Row[];
  nextMessageId: number;
}

const KEY = 'careai-demo-db';
const VERSION = 1;
const DAY_MS = 86_400_000;

export const ORG_SLUG: string = seed.orgSlug;
export const ORG_NAME: string = seed.orgName;

/** Shift every date in the seed so "3 days ago" in the seed is 3 days ago today. */
function freshSeed(): DemoDb {
  const delta = Date.now() - new Date(seed.exportedAt).getTime();
  const dayDelta = Math.round(delta / DAY_MS);
  const shift = (v: unknown): unknown => {
    if (typeof v !== 'string') return v;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return new Date(new Date(v + 'T00:00:00Z').getTime() + dayDelta * DAY_MS).toISOString().slice(0, 10);
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
      return new Date(new Date(v).getTime() + delta).toISOString();
    }
    return v;
  };
  const rows = (list: Row[]) => list.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, shift(v)])));
  const messages = rows(seed.messages as Row[]);
  return {
    version: VERSION,
    doctors: rows(seed.doctors as Row[]),
    patients: rows(seed.patients as Row[]),
    checkins: rows(seed.checkins as Row[]),
    alerts: rows(seed.alerts as Row[]),
    messages,
    disease_protocols: seed.disease_protocols as Row[],
    call_sessions: [],
    nextMessageId: Math.max(0, ...messages.map((m) => Number(m.id) || 0)) + 1,
  };
}

export function load(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as DemoDb;
      if (db.version === VERSION) return db;
    }
  } catch {
    /* fall through to a fresh seed */
  }
  const db = freshSeed();
  save(db);
  return db;
}

export function save(db: DemoDb): void {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      return;
    } catch {
      // Storage full: drop the oldest stored photo and try again.
      const withPhoto = db.checkins
        .filter((c) => typeof c.photo_url === 'string' && c.photo_url.startsWith('data:'))
        .sort((a, b) => String(a.checkin_date).localeCompare(String(b.checkin_date)));
      if (!withPhoto.length) return;
      withPhoto[0].photo_url = null;
    }
  }
}

export function reset(): void {
  localStorage.removeItem(KEY);
  // Also sign out of the demo patient session so the app starts clean.
  Object.keys(localStorage)
    .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
    .forEach((k) => localStorage.removeItem(k));
}

export function mutate<T>(fn: (db: DemoDb) => T): T {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}
