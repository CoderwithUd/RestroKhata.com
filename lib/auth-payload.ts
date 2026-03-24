type AnyRecord = Record<string, unknown>;

const WRAPPER_KEYS = ["data", "result", "payload", "session", "response"] as const;
const TOKEN_KEYS = ["accessToken", "token", "jwt", "authToken", "access_token"] as const;
const REFRESH_TOKEN_KEYS = ["refreshToken", "refresh_token"] as const;

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function collectObjects(input: unknown): AnyRecord[] {
  const root = asRecord(input);
  if (!root) return [];

  const queue: AnyRecord[] = [root];
  const visited = new Set<AnyRecord>();
  const objects: AnyRecord[] = [];

  while (queue.length && objects.length < 20) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;

    visited.add(current);
    objects.push(current);

    for (const key of WRAPPER_KEYS) {
      const nested = asRecord(current[key]);
      if (nested && !visited.has(nested)) {
        queue.push(nested);
      }
    }
  }

  return objects;
}

function pickFirstRecord(objects: AnyRecord[], keys: readonly string[]): AnyRecord | null {
  for (const object of objects) {
    for (const key of keys) {
      const nested = asRecord(object[key]);
      if (nested) return nested;
    }
  }
  return null;
}

function pickFirstString(objects: AnyRecord[], keys: readonly string[]): string | undefined {
  for (const object of objects) {
    for (const key of keys) {
      const value = asString(object[key]);
      if (value) return value;
    }
  }
  return undefined;
}

function looksLikeUserRecord(record: AnyRecord): boolean {
  return Boolean(
    asString(record.email) ||
      asString(record.name) ||
      asString(record.fullName) ||
      asString(record.username) ||
      asString(record.ownerName) ||
      asString(record.userId) ||
      asString(record.id) ||
      asString(record._id),
  );
}

function looksLikeTenantRecord(record: AnyRecord): boolean {
  return Boolean(
    asString(record.slug) ||
      asString(record.restaurantSlug) ||
      asString(record.tenantSlug) ||
      asString(record.name) ||
      asString(record.restaurantName) ||
      asString(record.businessName) ||
      asString(record.tenantId) ||
      asString(record.restaurantId),
  );
}

export type ParsedAuthPayload = {
  token?: string | null;
  refreshToken?: string | null;
  user: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  } | null;
  tenant: {
    id?: string;
    name?: string;
    slug?: string;
  } | null;
};

export function parseAuthPayload(data: unknown): ParsedAuthPayload {
  const objects = collectObjects(data);
  if (!objects.length) {
    return { user: null, tenant: null };
  }

  const userRecord =
    pickFirstRecord(objects, ["user", "owner", "admin", "profile", "account"]) ||
    objects.find(looksLikeUserRecord) ||
    null;
  const tenantRecord =
    pickFirstRecord(objects, ["tenant", "restaurant", "organization", "business"]) ||
    pickFirstRecord(userRecord ? [userRecord] : [], ["tenant", "restaurant"]) ||
    objects.find(looksLikeTenantRecord) ||
    null;

  const parsedUser = userRecord
    ? {
        id: asString(userRecord.id) || asString(userRecord._id) || asString(userRecord.userId),
        name:
          asString(userRecord.name) ||
          asString(userRecord.fullName) ||
          asString(userRecord.username) ||
          asString(userRecord.ownerName),
        email: asString(userRecord.email) || asString(userRecord.mail),
        role:
          asString(userRecord.role) ||
          asString(userRecord.userRole) ||
          asString(userRecord.type),
      }
    : null;

  const parsedTenant = tenantRecord
    ? {
        id:
          asString(tenantRecord.id) ||
          asString(tenantRecord._id) ||
          asString(tenantRecord.tenantId) ||
          asString(tenantRecord.restaurantId),
        name:
          asString(tenantRecord.name) ||
          asString(tenantRecord.restaurantName) ||
          asString(tenantRecord.businessName),
        slug:
          asString(tenantRecord.slug) ||
          asString(tenantRecord.restaurantSlug) ||
          asString(tenantRecord.tenantSlug),
      }
    : null;

  const userHasAnyField = Boolean(parsedUser && (parsedUser.id || parsedUser.name || parsedUser.email || parsedUser.role));
  const tenantHasAnyField = Boolean(parsedTenant && (parsedTenant.id || parsedTenant.name || parsedTenant.slug));

  const user = userHasAnyField ? parsedUser : userRecord ? {} : null;
  const tenant = tenantHasAnyField ? parsedTenant : tenantRecord ? {} : null;
  const token = pickFirstString(objects, TOKEN_KEYS) ?? undefined;
  const refreshToken = pickFirstString(objects, REFRESH_TOKEN_KEYS) ?? undefined;

  return { user, tenant, token, refreshToken };
}

export function extractAuthToken(data: unknown): string | null {
  const objects = collectObjects(data);
  if (!objects.length) return null;
  return pickFirstString(objects, TOKEN_KEYS) ?? null;
}
