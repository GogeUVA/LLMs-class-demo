'use strict';

const {
  normalizeSearch,
  normalizeCategory,
  normalizeDateRange,
  normalizeFilters,
  escapeLikePattern,
  escapeRegExp,
  MAX_SEARCH_LENGTH,
} = require('./src/transactions/normalizeTransactionFilters');
const { CATEGORIES } = require('./fixtures');

describe('normalizeSearch', () => {
  test.each([null, undefined, 42, {}, []])('non-string %p becomes null', (value) => {
    expect(normalizeSearch(value)).toEqual({ value: null, errors: [] });
  });

  test('empty and whitespace-only become null', () => {
    expect(normalizeSearch('')).toEqual({ value: null, errors: [] });
    expect(normalizeSearch('   \t\n  ')).toEqual({ value: null, errors: [] });
  });

  test('trims and collapses internal whitespace', () => {
    expect(normalizeSearch('  hello   world  ')).toEqual({
      value: 'hello world',
      errors: [],
    });
  });

  test('strips control characters', () => {
    expect(normalizeSearch('a\u0000b\u0007c')).toEqual({ value: 'abc', errors: [] });
  });

  test('truncates over-max input and records SEARCH_TOO_LONG', () => {
    const input = 'a'.repeat(MAX_SEARCH_LENGTH + 5);
    const result = normalizeSearch(input);
    expect(result.value).toHaveLength(MAX_SEARCH_LENGTH);
    expect(result.errors).toEqual([
      {
        field: 'search',
        code: 'SEARCH_TOO_LONG',
        message: `"search" must be at most ${MAX_SEARCH_LENGTH} characters.`,
      },
    ]);
  });
});

describe('normalizeCategory', () => {
  test('throws when allowedCategories is missing', () => {
    expect(() => normalizeCategory('Food', undefined)).toThrow(/allowedCategories/);
  });

  test.each([null, undefined, 1, {}])('non-string %p becomes null', (value) => {
    expect(normalizeCategory(value, CATEGORIES)).toEqual({ value: null, errors: [] });
  });

  test('empty and whitespace-only become null', () => {
    expect(normalizeCategory('', CATEGORIES)).toEqual({ value: null, errors: [] });
    expect(normalizeCategory('  \t ', CATEGORIES)).toEqual({ value: null, errors: [] });
  });

  test('matches case-insensitively and returns canonical casing', () => {
    expect(normalizeCategory('  food ', CATEGORIES)).toEqual({
      value: 'Food',
      errors: [],
    });
  });

  test('unsupported category becomes null with UNSUPPORTED_CATEGORY', () => {
    expect(normalizeCategory('Crypto', CATEGORIES)).toEqual({
      value: null,
      errors: [
        {
          field: 'category',
          code: 'UNSUPPORTED_CATEGORY',
          message: expect.stringMatching(/Unknown category "Crypto"/),
        },
      ],
    });
  });
});

describe('normalizeDateRange', () => {
  test('both missing yields no bounds', () => {
    expect(normalizeDateRange('', '')).toEqual({ start: undefined, end: undefined, errors: [] });
    expect(normalizeDateRange(null, undefined)).toEqual({
      start: undefined,
      end: undefined,
      errors: [],
    });
  });

  test('missing start only keeps end bound', () => {
    const { start, end, errors } = normalizeDateRange('', '2026-01-15');
    expect(start).toBeUndefined();
    expect(end).toBe(Date.UTC(2026, 0, 15) + 24 * 60 * 60 * 1000 - 1);
    expect(errors).toEqual([]);
  });

  test('missing end only keeps start bound', () => {
    const { start, end, errors } = normalizeDateRange('2026-01-15', '');
    expect(start).toBe(Date.UTC(2026, 0, 15));
    expect(end).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test('invalid format records INVALID_DATE and drops that bound', () => {
    const result = normalizeDateRange('01/05/2026', '2026-01-10');
    expect(result.start).toBeUndefined();
    expect(result.end).toBe(Date.UTC(2026, 0, 10) + 24 * 60 * 60 * 1000 - 1);
    expect(result.errors[0]).toMatchObject({ field: 'startDate', code: 'INVALID_DATE' });
  });

  test('impossible calendar dates are rejected', () => {
    const result = normalizeDateRange('2026-02-30', '2026-01-01');
    expect(result.start).toBeUndefined();
    expect(result.errors[0].code).toBe('INVALID_DATE');
  });

  test('start after end drops entire range with INVALID_RANGE', () => {
    const result = normalizeDateRange('2026-03-01', '2026-01-01');
    expect(result).toEqual({
      start: undefined,
      end: undefined,
      errors: [
        {
          field: 'endDate',
          code: 'INVALID_RANGE',
          message: expect.stringMatching(/on or after/),
        },
      ],
    });
  });

  test('start equal to end is valid inclusive range', () => {
    const result = normalizeDateRange('2026-02-14', '2026-02-14');
    expect(result.start).toBe(Date.UTC(2026, 1, 14));
    expect(result.end).toBe(Date.UTC(2026, 1, 14) + 24 * 60 * 60 * 1000 - 1);
    expect(result.errors).toEqual([]);
  });

  test('accepts ISO datetime strings', () => {
    const result = normalizeDateRange('2026-03-01T15:30:00Z', '2026-03-01');
    expect(result.start).toBe(Date.parse('2026-03-01T15:30:00Z'));
    expect(result.end).toBe(Date.UTC(2026, 2, 1) + 24 * 60 * 60 * 1000 - 1);
    expect(result.errors).toEqual([]);
  });

  test('idempotent on numeric bounds', () => {
    const first = normalizeDateRange('2026-01-01', '2026-01-31');
    const second = normalizeDateRange(first.start, first.end);
    expect(second).toEqual({ ...first, errors: [] });
  });
});

describe('escape helpers', () => {
  test('escapeLikePattern escapes %, _, and backslash', () => {
    expect(escapeLikePattern('100%_off\\sale')).toBe('100\\%\\_off\\\\sale');
  });

  test('escapeRegExp escapes regex metacharacters', () => {
    expect(escapeRegExp('.*(+?^${}|[]\\)')).toBe('\\.\\*\\(\\+\\?\\^\\$\\{\\}\\|\\[\\]\\\\\\)');
  });
});

describe('normalizeFilters', () => {
  test('valid combination produces no errors', () => {
    const { filters, errors } = normalizeFilters(
      {
        search: '  Starbucks ',
        category: 'food',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
      { allowedCategories: CATEGORIES }
    );
    expect(errors).toEqual([]);
    expect(filters.search).toBe('Starbucks');
    expect(filters.searchTerms).toEqual(['starbucks']);
    expect(filters.category).toBe('Food');
    expect(filters.startDate).toBe(Date.UTC(2026, 0, 1));
    expect(filters.endDate).toBe(Date.UTC(2026, 0, 31) + 24 * 60 * 60 * 1000 - 1);
  });

  test('malformed combination returns expected filters and errors', () => {
    const { filters, errors } = normalizeFilters(
      {
        search: 'ok',
        startDate: 'bad-start',
        endDate: '2026-01-01',
        category: 'Nope',
      },
      { allowedCategories: CATEGORIES }
    );
    expect(filters.category).toBeNull();
    expect(filters.startDate).toBeUndefined();
    expect(filters.endDate).toBe(Date.UTC(2026, 0, 1) + 24 * 60 * 60 * 1000 - 1);
    expect(errors.map((e) => e.code).sort()).toEqual(['INVALID_DATE', 'UNSUPPORTED_CATEGORY']);
  });

  test('idempotent when re-run on normalized fields', () => {
    const raw = {
      search: '  coffee  shop ',
      category: 'FOOD',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    };
    const first = normalizeFilters(raw, { allowedCategories: CATEGORIES });
    const second = normalizeFilters(
      {
        search: first.filters.search,
        category: first.filters.category,
        startDate: first.filters.startDate,
        endDate: first.filters.endDate,
      },
      { allowedCategories: CATEGORIES }
    );
    expect(second.errors).toEqual([]);
    expect(second.filters).toEqual(first.filters);
  });

  test('does not mutate the input object', () => {
    const raw = {
      search: '  hello ',
      category: ' Food ',
      startDate: ' 2026-01-01 ',
      endDate: ' 2026-01-02 ',
    };
    const snapshot = JSON.parse(JSON.stringify(raw));
    normalizeFilters(raw, { allowedCategories: CATEGORIES });
    expect(raw).toEqual(snapshot);
  });
});
