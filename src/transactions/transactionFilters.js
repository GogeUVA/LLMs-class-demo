'use strict';

/**
 * Transaction filtering logic for GET /transactions.
 *
 * Validation and normalization live in normalizeTransactionFilters.js.
 * This module adapts HTTP query params and applies filters to in-memory rows.
 */

const { normalizeFilters, MAX_SEARCH_LENGTH } = require('./normalizeTransactionFilters');
const DEFAULT_SEARCH_FIELDS = ['description', 'merchant', 'notes', 'category'];
const DEFAULT_GET_DATE = (txn) => txn.date;
const DEFAULT_GET_CATEGORY = (txn) => txn.category;

/** Lowercase, Unicode-normalize, and collapse all whitespace runs to one space. */
function normalizeText(value) {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

class FilterValidationError extends Error {
  /** @param {{ param: string, message: string }[]} details */
  constructor(details) {
    super('Invalid query parameters');
    this.name = 'FilterValidationError';
    this.status = 400;
    this.details = details;
  }
}

/**
 * @param {{ field: string, code: string, message: string }[]} errors
 * @returns {{ param: string, message: string }[]}
 */
function toValidationDetails(errors) {
  return errors.map((err) => ({
    param: err.field,
    message: err.message,
  }));
}

/**
 * Reads a single string param. Returns undefined when missing, empty, or
 * whitespace only. Records an error for repeated params or non-string values.
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
  const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
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

/**
 * Validates raw query params and returns a normalized filter object.
 * Throws FilterValidationError (status 400) listing every problem found.
 *
 * @param {object} query  e.g. req.query
 * @param {object} [options]
 * @param {string[]} [options.allowedCategories]
 * @param {number} [options.maxSearchLength=100]
 */
function parseTransactionFilters(query, options = {}) {
  const { allowedCategories, maxSearchLength = MAX_SEARCH_LENGTH } = options;
  const paramErrors = [];

  const raw = {
    search: readParam(query, 'search', paramErrors),
    startDate: readParam(query, 'startDate', paramErrors),
    endDate: readParam(query, 'endDate', paramErrors),
    category: readParam(query, 'category', paramErrors),
  };

  if (paramErrors.length > 0) {
    throw new FilterValidationError(paramErrors);
  }

  const normalizeOptions = Array.isArray(allowedCategories)
    ? { allowedCategories }
    : {};

  let { filters, errors } = normalizeFilters(
    {
      search: raw.search,
      startDate: raw.startDate,
      endDate: raw.endDate,
      category: raw.category,
    },
    normalizeOptions
  );

  if (!Array.isArray(allowedCategories) && raw.category !== undefined) {
    filters = {
      ...filters,
      category: normalizeText(raw.category),
    };
  }

  if (maxSearchLength !== MAX_SEARCH_LENGTH && filters.search && filters.search.length > maxSearchLength) {
    errors = [
      ...errors,
      {
        field: 'search',
        code: 'SEARCH_TOO_LONG',
        message: `"search" must be at most ${maxSearchLength} characters.`,
      },
    ];
  }

  if (errors.length > 0) {
    throw new FilterValidationError(toValidationDetails(errors));
  }

  const active = {};
  if (filters.searchTerms) {
    active.search = filters.search;
    active.searchTerms = filters.searchTerms;
  }
  if (filters.category !== null && filters.category !== undefined) {
    active.category =
      Array.isArray(allowedCategories) ? normalizeText(filters.category) : filters.category;
  }
  if (filters.startDate !== undefined) active.startDate = filters.startDate;
  if (filters.endDate !== undefined) active.endDate = filters.endDate;

  return active;
}

/** True if at least one filter is active. */
function hasActiveFilters(filters) {
  return Boolean(
    filters &&
      (filters.searchTerms ||
        (filters.category !== undefined && filters.category !== null) ||
        filters.startDate !== undefined ||
        filters.endDate !== undefined)
  );
}

/**
 * Returns the transactions that match ALL active filters, preserving order.
 * @param {object[]} transactions
 * @param {object} filters
 * @param {object} [options]
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

    if (category !== undefined && category !== null) {
      const txnCategory = getCategory(txn);
      if (txnCategory == null || normalizeText(txnCategory) !== category) return false;
    }

    if (hasDateFilter) {
      const ts = toTimestamp(getDate(txn));
      if (ts === null) return false;
      if (startDate !== undefined && ts < startDate) return false;
      if (endDate !== undefined && ts > endDate) return false;
    }

    if (searchTerms) {
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
  normalizeFilters,
};
