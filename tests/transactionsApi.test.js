import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTransactionQuery,
  getCategories,
  getTransactions,
} from '../public/transactionsApi.js';

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

test('buildTransactionQuery sends all active filters and omits cleared values', () => {
  assert.equal(
    buildTransactionQuery({
      search: ' coffee ',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      category: 'Food',
    }),
    '?search=coffee&startDate=2026-01-01&endDate=2026-01-31&category=Food',
  );
  assert.equal(buildTransactionQuery({ search: ' ', category: '' }), '');
});

test('getTransactions requests the filtered endpoint and returns transactions', async () => {
  const expected = [{ id: 1 }];
  const calls = [];
  const controller = new AbortController();
  const fetchImpl = async (...args) => {
    calls.push(args);
    return response({ transactions: expected });
  };

  const actual = await getTransactions(
    { category: 'Food' },
    { fetchImpl, signal: controller.signal },
  );

  assert.deepEqual(actual, expected);
  assert.equal(calls[0][0], '/transactions?category=Food');
  assert.equal(calls[0][1].signal, controller.signal);
});

test('getTransactions removes query parameters when filters are cleared', async () => {
  let requestedUrl;
  const fetchImpl = async (url) => {
    requestedUrl = url;
    return response({ transactions: [] });
  };

  await getTransactions(
    { search: '', startDate: '', endDate: '', category: '' },
    { fetchImpl },
  );

  assert.equal(requestedUrl, '/transactions');
});

test('getTransactions surfaces API errors and invalid responses', async () => {
  await assert.rejects(
    getTransactions({}, {
      fetchImpl: async () => response({ error: 'Service unavailable' }, { ok: false, status: 503 }),
    }),
    /Service unavailable/,
  );

  await assert.rejects(
    getTransactions({}, { fetchImpl: async () => response({ transactions: null }) }),
    /Invalid transactions response/,
  );
});

test('getCategories returns categories from the API', async () => {
  const categories = await getCategories({
    fetchImpl: async () => response({ categories: ['Food', 'Travel'] }),
  });

  assert.deepEqual(categories, ['Food', 'Travel']);
});

