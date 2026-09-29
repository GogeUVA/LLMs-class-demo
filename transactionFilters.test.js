'use strict';

const {
  parseTransactionFilters,
  applyTransactionFilters,
  hasActiveFilters,
  FilterValidationError,
} = require('./src/transactions/transactionFilters');
const { CATEGORIES, TRANSACTIONS } = require('./fixtures');

const run = (query, opts = { allowedCategories: CATEGORIES }) =>
  applyTransactionFilters(TRANSACTIONS, parseTransactionFilters(query, opts)).map((t) => t.id);

const errorsFor = (query, opts = { allowedCategories: CATEGORIES }) => {
  try {
    parseTransactionFilters(query, opts);
  } catch (err) {
    expect(err).toBeInstanceOf(FilterValidationError);
    return err.details;
  }
  throw new Error('Expected a FilterValidationError');
};

describe('parseTransactionFilters', () => {
  test.each([undefined, null, {}, { search: '', startDate: '', endDate: '', category: '' }, { search: '   \t\n ' }])(
    'treats %p as no filters',
    (query) => {
      const filters = parseTransactionFilters(query, { allowedCategories: CATEGORIES });
      expect(hasActiveFilters(filters)).toBe(false);
    }
  );

  test('normalizes search whitespace and case', () => {
    expect(parseTransactionFilters({ search: '  Starbucks \t  RESERVE ' }).searchTerms).toEqual([
      'starbucks',
      'reserve',
    ]);
  });

  test('rejects impossible calendar dates', () => {
    expect(errorsFor({ startDate: '2026-02-30' })[0].param).toBe('startDate');
    expect(errorsFor({ endDate: '2026-13-01' })[0].param).toBe('endDate');
  });

  test('collects every error at once', () => {
    const details = errorsFor({ startDate: 'bad', endDate: 'worse', category: 'Nope' });
    expect(details.map((d) => d.param).sort()).toEqual(['category', 'endDate', 'startDate']);
  });

  test('without allowedCategories, unknown category is accepted (yields zero results)', () => {
    expect(run({ category: 'Nope' }, {})).toEqual([]);
  });
});

describe('applyTransactionFilters', () => {
  test('returns input unchanged when no filters are active', () => {
    expect(applyTransactionFilters(TRANSACTIONS, {})).toBe(TRANSACTIONS);
  });

  test('handles non-array input safely', () => {
    expect(applyTransactionFilters(null, { category: 'food' })).toEqual([]);
  });

  test('excludes rows with unparseable dates only when a date filter is active', () => {
    const rows = [{ id: 'x', date: 'not a date', description: 'coffee' }];
    expect(applyTransactionFilters(rows, parseTransactionFilters({ search: 'coffee' }))).toHaveLength(1);
    expect(applyTransactionFilters(rows, parseTransactionFilters({ startDate: '2026-01-01' }))).toHaveLength(0);
  });

  test('searches the notes field', () => {
    expect(run({ search: 'lunch' })).toEqual([7]);
  });

  test('supports custom field accessors', () => {
    const rows = [{ id: 1, postedAt: new Date('2026-05-05T12:00:00Z'), memo: 'Gym', type: 'Health' }];
    const filters = parseTransactionFilters({ search: 'gym', category: 'health', startDate: '2026-05-05', endDate: '2026-05-05' });
    const out = applyTransactionFilters(rows, filters, {
      searchFields: ['memo'],
      getDate: (t) => t.postedAt,
      getCategory: (t) => t.type,
    });
    expect(out).toHaveLength(1);
  });
});
