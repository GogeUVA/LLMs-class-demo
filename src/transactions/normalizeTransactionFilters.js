'use strict';

const MAX_SEARCH_LENGTH = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/g;

/**
 * Maximum allowed length for a normalized search string.
 * @type {number}
 */
const SEARCH_MAX_LENGTH = MAX_SEARCH_LENGTH;

/**
 * Strips ASCII control characters from a string.
 * @param {string} value
 * @returns {string}
 */
function stripControlCharacters(value) {
  return value.replace(CONTROL_CHAR_RE, '');
}

/**
 * Escapes `%`, `_`, and `\` for use in SQL LIKE patterns with ESCAPE '\\'.
 * @param {string} value
 * @returns {string}
 */
function escapeLikePattern(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Escapes a string for safe use as a literal in `RegExp`.
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} value
 * @returns {number|null} UTC ms at start of calendar day, or null if invalid
 */
function parseDateOnlyToUtcMs(value) {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ts = Date.UTC(year, month - 1, day);
  const check = new Date(ts);

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ts;
}

/**
 * @param {unknown} value
 * @param {{ endOfDay?: boolean }} [options]
 * @returns {number|null}
 */
function parseDateBound(value, { endOfDay = false } = {}) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  const dateOnlyMs = parseDateOnlyToUtcMs(trimmed);
  if (dateOnlyMs !== null) {
    return endOfDay ? dateOnlyMs + DAY_MS - 1 : dateOnlyMs;
  }

  if (ISO_DATETIME_RE.test(trimmed) && parseDateOnlyToUtcMs(trimmed.slice(0, 10)) !== null) {
    const ts = Date.parse(trimmed);
    return Number.isNaN(ts) ? null : ts;
  }

  return null;
}

/**
 * Normalizes a free-text search filter.
 * Non-strings become null. Whitespace is trimmed and collapsed. Empty becomes null.
 * Over-length input is truncated and recorded as an error. Control characters are removed.
 *
 * @param {unknown} value
 * @returns {{ value: string|null, errors: { field: string, code: string, message: string }[] }}
 */
function normalizeSearch(value) {
  const errors = [];

  if (value === null || value === undefined || typeof value !== 'string') {
    return { value: null, errors };
  }

  let normalized = stripControlCharacters(value);
  normalized = normalized.trim().replace(/\s+/g, ' ');

  if (normalized === '') {
    return { value: null, errors };
  }

  if (normalized.length > MAX_SEARCH_LENGTH) {
    errors.push({
      field: 'search',
      code: 'SEARCH_TOO_LONG',
      message: `"search" must be at most ${MAX_SEARCH_LENGTH} characters.`,
    });
    normalized = normalized.slice(0, MAX_SEARCH_LENGTH);
  }

  return { value: normalized, errors };
}

/**
 * Normalizes a category against an allowed list (case-insensitive).
 * Empty or unsupported values become null; unsupported categories produce UNSUPPORTED_CATEGORY.
 *
 * @param {unknown} value
 * @param {string[]} allowedCategories
 * @returns {{ value: string|null, errors: { field: string, code: string, message: string }[] }}
 */
function normalizeCategory(value, allowedCategories) {
  if (!Array.isArray(allowedCategories)) {
    throw new TypeError('normalizeCategory requires allowedCategories array');
  }

  const errors = [];

  if (value === null || value === undefined || typeof value !== 'string') {
    return { value: null, errors };
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return { value: null, errors };
  }

  const wanted = trimmed.toLowerCase();
  const canonical = allowedCategories.find((c) => c.toLowerCase() === wanted);

  if (canonical === undefined) {
    errors.push({
      field: 'category',
      code: 'UNSUPPORTED_CATEGORY',
      message: `Unknown category "${trimmed}". Allowed: ${allowedCategories.join(', ')}.`,
    });
    return { value: null, errors };
  }

  return { value: canonical, errors };
}

/**
 * Normalizes a start/end date range in UTC (inclusive end-of-day for date-only bounds).
 *
 * @param {unknown} startValue
 * @param {unknown} endValue
 * @returns {{
 *   start: number|undefined,
 *   end: number|undefined,
 *   errors: { field: string, code: string, message: string }[]
 * }}
 */
function normalizeDateRange(startValue, endValue) {
  const errors = [];
  let start;
  let end;

  const startMissing =
    startValue === null ||
    startValue === undefined ||
    (typeof startValue === 'string' && startValue.trim() === '');

  const endMissing =
    endValue === null ||
    endValue === undefined ||
    (typeof endValue === 'string' && endValue.trim() === '');

  if (!startMissing) {
    const parsedStart = parseDateBound(startValue, { endOfDay: false });
    if (parsedStart === null) {
      errors.push({
        field: 'startDate',
        code: 'INVALID_DATE',
        message: '"startDate" must be a valid date in YYYY-MM-DD (or ISO 8601) format.',
      });
    } else {
      start = parsedStart;
    }
  }

  if (!endMissing) {
    const parsedEnd = parseDateBound(endValue, { endOfDay: true });
    if (parsedEnd === null) {
      errors.push({
        field: 'endDate',
        code: 'INVALID_DATE',
        message: '"endDate" must be a valid date in YYYY-MM-DD (or ISO 8601) format.',
      });
    } else {
      end = parsedEnd;
    }
  }

  if (start !== undefined && end !== undefined && start > end) {
    errors.push({
      field: 'endDate',
      code: 'INVALID_RANGE',
      message: '"endDate" must be on or after "startDate".',
    });
    return { start: undefined, end: undefined, errors };
  }

  return { start, end, errors };
}

/**
 * Builds query-layer search terms (lowercase, whitespace-collapsed words).
 * @param {string|null} search
 * @returns {string[]|undefined}
 */
function buildSearchTerms(search) {
  if (search === null || search === undefined || search === '') return undefined;
  const collapsed = search.trim().replace(/\s+/g, ' ');
  if (collapsed === '') return undefined;
  const terms = collapsed.toLowerCase().split(' ');
  return terms.length ? terms : undefined;
}

/**
 * Validates and normalizes all transaction filter fields in one pass.
 *
 * @param {object} rawFilters
 * @param {object} [options]
 * @param {string[]} [options.allowedCategories] When omitted, category is trimmed only (no allow-list check).
 * @returns {{ filters: object, errors: { field: string, code: string, message: string }[] }}
 */
function normalizeFilters(rawFilters, options = {}) {
  const source = rawFilters && typeof rawFilters === 'object' ? rawFilters : {};
  const { allowedCategories } = options;

  const { value: search, errors: searchErrors } = normalizeSearch(source.search);
  const { start, end, errors: dateErrors } = normalizeDateRange(
    source.startDate,
    source.endDate
  );

  let category = null;
  const categoryErrors = [];

  if (source.category !== undefined && source.category !== null) {
    if (Array.isArray(allowedCategories)) {
      const cat = normalizeCategory(source.category, allowedCategories);
      category = cat.value;
      categoryErrors.push(...cat.errors);
    } else if (typeof source.category === 'string') {
      const trimmed = source.category.trim();
      category = trimmed === '' ? null : trimmed;
    } else {
      category = null;
    }
  }

  const errors = [...searchErrors, ...dateErrors, ...categoryErrors];

  const filters = {
    search,
    searchTerms: buildSearchTerms(search),
    category,
    startDate: start,
    endDate: end,
  };

  return { filters, errors };
}

module.exports = {
  MAX_SEARCH_LENGTH,
  SEARCH_MAX_LENGTH,
  normalizeSearch,
  normalizeCategory,
  normalizeDateRange,
  normalizeFilters,
  escapeLikePattern,
  escapeRegExp,
  stripControlCharacters,
};
