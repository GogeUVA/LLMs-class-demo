'use strict';

/**
 * Transaction filtering logic for GET /transactions.
 *
 * This module has no framework or database dependency, so it can be reused
 * by any route, service, or test. It does two things:
 *   1. parseTransactionFilters(query)   -> validates raw query params
 *   2. applyTransactionFilters(list, f) -> returns only matching transactions
 *
 * Supported query params: search, startDate, endDate, category.
 * All active filters are combined with AND. Missing or empty params are ignored,
 * so requests without filters behave exactly as before.
 */

const MAX_SEARCH_LENGTH = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const DEFAULT_SEARCH_FIELDS = ['description', 'merchant', 'notes', 'category'];
const DEFAULT_GET_DATE = (txn) => txn.date;
const DEFAULT_GET_CATEGORY = (txn) => txn.category;

class FilterValidationError extends Error {
  /** @param {{ param: string, message: string }[]} details */
  constructor(details) {
    super('Invalid query parameters');
    this.name = 'FilterValidationError';
    this.status = 400;
    this.details = details;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Lowercase, Unicode-normalize, and collapse all whitespace runs to one space. */
function normalizeText(value) {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reads a single string param. Returns undefined when missing, empty, or
 * whitespace only. Records an error for repeated params (?a=1&a=2) or nested
 * objects (?a[b]=1), which some query parsers produce.
 */
function readParam(query, name, errors) {
  const raw = query == null ? undefined : query[name];
  if (raw === undefined || raw === null) return undefined;

  if (Array.isArray(raw)) {
    errors.push({ param: name, message: `"${name}" must be provided only once.` });
    return undefined;
  }
  if (typeof raw !== 'string') {
    errors.push({ param: name, message: `"${name}" must be a plain string value.` });
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Validates a YYYY-MM-DD string as a real calendar date. Returns UTC ms or null. */
function parseDateOnly(value) {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ts = Date.UTC(year, month - 1, day);
  const check = new Date(ts);

  // Rejects rollovers like 2026-02-30 (which Date would turn into March 2).
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
 * Parses a query date. Accepts YYYY-MM-DD (treated as a UTC calendar day) or a
 * full ISO 8601 datetime with timezone. For date-only end dates, the whole day
 * is included (up to 23:59:59.999 UTC). Returns ms timestamp or null if invalid.
 */
function parseQueryDate(value, { endOfDay = false } = {}) {
  const dateOnly = parseDateOnly(value);
  if (dateOnly !== null) return endOfDay ? dateOnly + DAY_MS - 1 : dateOnly;

  if (ISO_DATETIME_RE.test(value) && parseDateOnly(value.slice(0, 10)) !== null) {
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
  }
  return null;
}

/** Converts a stored transaction date (string, Date, or ms number) to ms, or null. */
function toTimestamp(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const dateOnly = parseDateOnly(value.trim());
    if (dateOnly !== null) return dateOnly;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Validates raw query params and returns a normalized filter object.
 * Throws FilterValidationError (status 400) listing every problem found.
 *
 * @param {object} query  e.g. req.query
 * @param {object} [options]
 * @param {string[]} [options.allowedCategories] If given, unknown categories are
 *        rejected with a 400. If omitted, any category is accepted and an
 *        unknown one simply yields zero results.
 * @param {number} [options.maxSearchLength=100]
 * @returns {{ search?: string, searchTerms?: string[], startDate?: number,
 *             endDate?: number, category?: string }}
 */
function parseTransactionFilters(query, options = {}) {
  const { allowedCategories, maxSearchLength = MAX_SEARCH_LENGTH } = options;
  const errors = [];
  const filters = {};

  // search
  const search = readParam(query, 'search', errors);
  if (search !== undefined) {
    const normalized = normalizeText(search);
    if (normalized.length > maxSearchLength) {
      errors.push({
        param: 'search',
        message: `"search" must be at most ${maxSearchLength} characters.`,
      });
    } else if (normalized !== '') {
      filters.search = normalized;
      filters.searchTerms = normalized.split(' ');
    }
  }

  // startDate / endDate
  const startRaw = readParam(query, 'startDate', errors);
  if (startRaw !== undefined) {
    const ts = parseQueryDate(startRaw);
    if (ts === null) {
      errors.push({
        param: 'startDate',
        message: '"startDate" must be a valid date in YYYY-MM-DD (or ISO 8601) format.',
      });
    } else {
      filters.startDate = ts;
    }
  }

  const endRaw = readParam(query, 'endDate', errors);
  if (endRaw !== undefined) {
    const ts = parseQueryDate(endRaw, { endOfDay: true });
    if (ts === null) {
      errors.push({
        param: 'endDate',
        message: '"endDate" must be a valid date in YYYY-MM-DD (or ISO 8601) format.',
      });
    } else {
      filters.endDate = ts;
    }
  }

  if (
    filters.startDate !== undefined &&
    filters.endDate !== undefined &&
    filters.startDate > filters.endDate
  ) {
    errors.push({ param: 'endDate', message: '"endDate" must be on or after "startDate".' });
  }

  // category
  const categoryRaw = readParam(query, 'category', errors);
  if (categoryRaw !== undefined) {
    const wanted = normalizeText(categoryRaw);
    if (Array.isArray(allowedCategories)) {
      const canonical = allowedCategories.find((c) => normalizeText(c) === wanted);
      if (canonical === undefined) {
        errors.push({
          param: 'category',
          message: `Unknown category "${categoryRaw}". Allowed: ${allowedCategories.join(', ')}.`,
        });
      } else {
        filters.category = normalizeText(canonical);
      }
    } else {
      filters.category = wanted;
    }
  }

  if (errors.length > 0) throw new FilterValidationError(errors);
  return filters;
}

/** True if at least one filter is active. */
function hasActiveFilters(filters) {
  return Boolean(
    filters &&
      (filters.searchTerms ||
        filters.category !== undefined ||
        filters.startDate !== undefined ||
        filters.endDate !== undefined)
  );
}

/**
 * Returns the transactions that match ALL active filters, preserving the
 * original order. With no active filters, returns the input unchanged.
 *
 * @param {object[]} transactions
 * @param {object} filters  output of parseTransactionFilters
 * @param {object} [options]
 * @param {string[]} [options.searchFields] fields to search (default: description, merchant, notes, category)
 * @param {(txn: object) => any} [options.getDate] reads a transaction's date (default: txn.date)
 * @param {(txn: object) => any} [options.getCategory] reads a transaction's category (default: txn.category)
 */
function applyTransactionFilters(transactions, filters, options = {}) {
  const list = Array.isArray(transactions) ? transactions : [];
  if (!hasActiveFilters(filters)) return list;

  const searchFields = options.searchFields || DEFAULT_SEARCH_FIELDS;
  const getDate = options.getDate || DEFAULT_GET_DATE;
  const getCategory = options.getCategory || DEFAULT_GET_CATEGORY;
  const { searchTerms, category, startDate, endDate } = filters;
  const hasDateFilter = startDate !== undefined || endDate !== undefined;

  return list.filter((txn) => {
    if (!txn || typeof txn !== 'object') return false;

    if (category !== undefined) {
      const txnCategory = getCategory(txn);
      if (txnCategory == null || normalizeText(txnCategory) !== category) return false;
    }

    if (hasDateFilter) {
      const ts = toTimestamp(getDate(txn));
      if (ts === null) return false; // undated rows cannot satisfy a date filter
      if (startDate !== undefined && ts < startDate) return false;
      if (endDate !== undefined && ts > endDate) return false;
    }

    if (searchTerms) {
      // Plain substring matching, never regex, so input like ".*" or "(" is safe.
      // Every term must appear somewhere across the searchable fields.
      const haystack = normalizeText(
        searchFields
          .map((field) => txn[field])
          .filter((v) => v !== undefined && v !== null)
          .join(' ')
      );
      if (!searchTerms.every((term) => haystack.includes(term))) return false;
    }

    return true;
  });
}

module.exports = {
  parseTransactionFilters,
  applyTransactionFilters,
  hasActiveFilters,
  FilterValidationError,
  normalizeText,
  DEFAULT_SEARCH_FIELDS,
  MAX_SEARCH_LENGTH,
};
