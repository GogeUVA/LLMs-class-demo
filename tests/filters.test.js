import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFilters, filterTransactions } from '../src/filters.js';
import { getViewState, hasActiveFilters, buildQuery } from '../public/view.js';

test('parseFilters rejects impossible calendar dates', () => {
  assert.ok(parseFilters({ startDate: '2026-02-30' }).error);
  assert.ok(parseFilters({ endDate: '2026-13-01' }).error);
});
test('parseFilters accepts equal start and end', () => {
  assert.ok(parseFilters({ startDate: '2026-01-01', endDate: '2026-01-01' }).filters);
});
test('filterTransactions with no filters returns everything', () => {
  const data = [{ description: 'a', date: '2026-01-01', category: 'X' }];
  assert.deepEqual(filterTransactions(data, {}), data);
});

test('view state: loading, error, empty, list', () => {
  assert.equal(getViewState({ loading: true }).kind, 'loading');
  assert.equal(getViewState({ error: 'HTTP 500' }).kind, 'error');
  const empty = getViewState({ transactions: [], filtersActive: true });
  assert.equal(empty.kind, 'empty');
  assert.match(empty.message, /match your filters/);
  assert.equal(getViewState({ transactions: [], filtersActive: false }).message, 'No transactions yet.');
  assert.equal(getViewState({ transactions: [{}] }).kind, 'list');
});
test('hasActiveFilters / buildQuery ignore blanks and encode specials', () => {
  assert.equal(hasActiveFilters({ search: '  ', startDate: '', endDate: '', category: '' }), false);
  assert.equal(buildQuery({ search: '', category: '' }), '');
  assert.equal(buildQuery({ search: '100% & more' }), '?search=100%25+%26+more');
});
