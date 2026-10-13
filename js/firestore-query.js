const DATE_FILTERED_COLLECTIONS = new Set(["movimientos", "transferencias", "pagosTarjeta"]);
const TRANSIENT_READ_CODES = new Set(["aborted", "deadline-exceeded", "unavailable"]);

export function buildEntityPageOptions({ entity, state, append, pageSize }) {
  const movementQuery = entity === "movimientos";
  const dateFilteredQuery = DATE_FILTERED_COLLECTIONS.has(entity);
  const filters = state.filter || {};

  return {
    limit: pageSize,
    cursor: append ? state.entityCursor : null,
    orderField: DATE_FILTERED_COLLECTIONS.has(entity) ? "fecha" : "createdAt",
    direction: "desc",
    equals: {
      ...(movementQuery ? filters.equals || {} : {}),
      ...(movementQuery && state.movementAccountFilter ? { cuenta_id: state.movementAccountFilter } : {}),
    },
    startDate: dateFilteredQuery ? filters.startDate : undefined,
    endDate: dateFilteredQuery ? filters.endDate : undefined,
  };
}

function errorCode(error) {
  return String(error?.code || "").split("/").at(-1);
}

export async function retryFirestoreRead(operation, {
  maxRetries = 2,
  baseDelayMs = 150,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  let retries = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      const attempts = retries + 1;
      if (!TRANSIENT_READ_CODES.has(errorCode(error)) || retries >= maxRetries) {
        try { error.readAttempts = attempts; } catch { /* Preserve the original Firebase error. */ }
        throw error;
      }
      await wait(baseDelayMs * (2 ** retries));
      retries += 1;
    }
  }
}

function safeFilterValue(field, value) {
  return /(?:^uid$|uid|_id$)/i.test(field) ? "[id oculto]" : value;
}

export function firestoreQueryContext(collection, options, error) {
  const equals = Object.fromEntries(Object.entries(options.equals || {})
    .map(([field, value]) => [field, safeFilterValue(field, value)]));
  const dateRange = {};
  if (options.startDate) dateRange.gte = options.startDate;
  if (options.endDate) dateRange.lte = options.endDate;

  return {
    code: errorCode(error) || "unknown",
    route: `#${collection}`,
    path: `users/{uid}/${collection}`,
    parameters: {
      equals,
      ...(Object.keys(dateRange).length ? { range: { field: options.dateField || "fecha", ...dateRange } } : {}),
      orderBy: { field: options.orderField || "createdAt", direction: options.direction || "desc" },
      startAfter: Boolean(options.cursor),
      limit: Math.min(Math.max(options.limit || 50, 1), 500),
    },
    attempts: error?.readAttempts || 1,
  };
}
