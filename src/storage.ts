import type { RedisLike } from "./toolkit/session/redis.js";

// ---------------------------------------------------------------------------
// Durable persistent storage for GroupGuardian — backed by the toolkit's
// Redis adapter. Falls back to in-memory Maps when Redis is unavailable
// (dev/test). All keys are scoped by chat ID to avoid cross-group leaks.
// ---------------------------------------------------------------------------

let redis: RedisLike | null = null;
const mem = new Map<string, string>();

function memAdapter(): RedisLike {
  return {
    async get(k) { return mem.get(k) ?? null; },
    async set(k, v) { mem.set(k, v); },
    async del(k) { mem.delete(k); },
    async keys(p) {
      const prefix = p.replace("*", "");
      return [...mem.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

async function client(): Promise<RedisLike> {
  if (redis) return redis;
  const url = typeof process !== "undefined" ? process.env?.REDIS_URL : undefined;
  if (!url) return memAdapter();
  try {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ioredis: any = req("ioredis");
    const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
    redis = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false }) as RedisLike;
    return redis;
  } catch {
    return memAdapter();
  }
}

export async function getStore<T>(key: string): Promise<T | undefined> {
  const raw = await (await client()).get(key);
  if (raw == null) return undefined;
  try { return JSON.parse(raw) as T; } catch { return undefined; }
}

export async function setStore<T>(key: string, value: T): Promise<void> {
  await (await client()).set(key, JSON.stringify(value));
}

export async function delStore(key: string): Promise<void> {
  await (await client()).del(key);
}

// ---------------------------------------------------------------------------
// Injectable clock — route all time decisions through now() so tests can
// override it. Default: Date.now().
// ---------------------------------------------------------------------------
let clockFn: () => number = Date.now;
export function now(): number { return clockFn(); }
export function setClock(fn: () => number): void { clockFn = fn; }

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface Member {
  userId: number;
  chatId: number;
  joinTime: number;
  verified: boolean;
  trusted: boolean;
  messageCount: number;
  warnCount: number;
}

export interface ModerationEvent {
  id: string;
  chatId: number;
  actionType: "warn" | "mute" | "kick" | "ban" | "verify" | "spam";
  actor: number;
  target: number;
  reason: string;
  timestamp: number;
}

export interface BotConfig {
  chatId: number;
  welcomeText: string;
  rulesText: string;
  spamThreshold: number;
  floodThreshold: number;
  detectorsEnabled: boolean;
  trustedUserIds: number[];
  verificationMinutes: number;
}

// ---------------------------------------------------------------------------
// Key helpers — explicit indices, NO keyspace scans.
// ---------------------------------------------------------------------------

const kMember = (chatId: number, userId: number) => `gg:member:${chatId}:${userId}`;
const kEventIdx = (chatId: number) => `gg:events:${chatId}`;
const kEvent = (id: string) => `gg:event:${id}`;
const kConfig = (chatId: number) => `gg:config:${chatId}`;
const kStats = (chatId: number) => `gg:stats:${chatId}`;

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

export async function getMember(chatId: number, userId: number): Promise<Member | undefined> {
  return getStore<Member>(kMember(chatId, userId));
}

export async function setMember(member: Member): Promise<void> {
  await setStore(kMember(member.chatId, member.userId), member);
}

// ---------------------------------------------------------------------------
// Moderation events — append to an index list + store individually.
//   Index capped at 500 (rolling window).
// ---------------------------------------------------------------------------

export async function addEvent(event: ModerationEvent): Promise<void> {
  await setStore(kEvent(event.id), event);
  const idx = await getStore<string[]>(kEventIdx(event.chatId)) ?? [];
  idx.push(event.id);
  // Cap at 500 — drop oldest when over.
  while (idx.length > 500) {
    const old = idx.shift()!;
    await delStore(kEvent(old));
  }
  await setStore(kEventIdx(event.chatId), idx);
}

export async function getEvents(chatId: number, limit = 20, offset = 0): Promise<ModerationEvent[]> {
  const idx = await getStore<string[]>(kEventIdx(chatId)) ?? [];
  // Newest first.
  const sliced = idx.slice().reverse().slice(offset, offset + limit);
  const events: ModerationEvent[] = [];
  for (const id of sliced) {
    const ev = await getStore<ModerationEvent>(kEvent(id));
    if (ev) events.push(ev);
  }
  return events;
}

export async function getEventCount(chatId: number): Promise<number> {
  const idx = await getStore<string[]>(kEventIdx(chatId)) ?? [];
  return idx.length;
}

// ---------------------------------------------------------------------------
// Bot config — defaults built-in.
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: Omit<BotConfig, "chatId"> = {
  welcomeText: "Welcome to the group! Please verify you're human to participate.",
  rulesText: "Be respectful. No spam. No harassment.",
  spamThreshold: 5,
  floodThreshold: 3,
  detectorsEnabled: true,
  trustedUserIds: [],
  verificationMinutes: 3,
};

export async function getConfig(chatId: number): Promise<BotConfig> {
  const stored = await getStore<BotConfig>(kConfig(chatId));
  return { ...DEFAULT_CONFIG, chatId, ...stored };
}

export async function setConfig(chatId: number, patch: Partial<BotConfig>): Promise<BotConfig> {
  const current = await getConfig(chatId);
  const merged = { ...current, ...patch, chatId };
  await setStore(kConfig(chatId), merged);
  return merged;
}

// ---------------------------------------------------------------------------
// Stats — simple counters (no keyspace scan).
// ---------------------------------------------------------------------------

export interface Stats {
  totalActions: number;
  verifiedMembers: number;
  totalMembers: number;
  recentEvents: number;
}

export async function getStats(chatId: number): Promise<Stats> {
  const raw = await getStore<Stats>(kStats(chatId));
  return raw ?? { totalActions: 0, verifiedMembers: 0, totalMembers: 0, recentEvents: 0 };
}

export async function incrementStat(chatId: number, field: keyof Stats, by = 1): Promise<void> {
  const s = await getStats(chatId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (s as any)[field] = (s[field] ?? 0) + by;
  await setStore(kStats(chatId), s);
}

export async function refreshMemberStats(chatId: number): Promise<void> {
  // We track member count via the stats store; refreshed on events.
  const s = await getStats(chatId);
  await setStore(kStats(chatId), s);
}
