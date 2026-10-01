import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionLoader } from '../public/transactionLoader.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

test('loader displays loading and then updates the UI with returned transactions', async () => {
  const transactions = [{ id: 1, description: 'Coffee' }];
  const renders = [];
  const load = createTransactionLoader({
    getTransactions: async () => transactions,
    readFilters: () => ({ category: 'Food' }),
    render: (...args) => renders.push(args),
  });

  await load();

  assert.equal(renders[0][0].kind, 'loading');
  assert.equal(renders[1][0].kind, 'list');
  assert.equal(renders[1][1], transactions);
});

test('loader displays the filtered empty state', async () => {
  const renders = [];
  const load = createTransactionLoader({
    getTransactions: async () => [],
    readFilters: () => ({ search: 'missing' }),
    render: (...args) => renders.push(args),
  });

  await load();

  assert.equal(renders.at(-1)[0].kind, 'empty');
  assert.match(renders.at(-1)[0].message, /match your filters/);
});

test('loader displays an appropriate request error', async () => {
  const renders = [];
  const load = createTransactionLoader({
    getTransactions: async () => { throw new Error('Network unavailable'); },
    readFilters: () => ({}),
    render: (...args) => renders.push(args),
  });

  await load();

  assert.equal(renders.at(-1)[0].kind, 'error');
  assert.match(renders.at(-1)[0].message, /Network unavailable/);
});

test('loader cancels and ignores stale requests when filters change rapidly', async () => {
  const first = deferred();
  const second = deferred();
  const requests = [first, second];
  const signals = [];
  const renders = [];
  let filters = { category: 'Food' };
  let requestIndex = 0;
  const load = createTransactionLoader({
    getTransactions: async (_filters, { signal }) => {
      signals.push(signal);
      return requests[requestIndex++].promise;
    },
    readFilters: () => filters,
    render: (...args) => renders.push(args),
  });

  const firstLoad = load();
  filters = { category: 'Travel' };
  const secondLoad = load();

  assert.equal(signals[0].aborted, true);
  second.resolve([{ id: 2, description: 'Train ticket' }]);
  await secondLoad;
  first.resolve([{ id: 1, description: 'Old result' }]);
  await firstLoad;

  const lists = renders.filter(([state]) => state.kind === 'list');
  assert.equal(lists.length, 1);
  assert.equal(lists[0][1][0].description, 'Train ticket');
});

test('loader requests all transactions after filters are cleared', async () => {
  const requestedFilters = [];
  let filters = { category: 'Food' };
  const load = createTransactionLoader({
    getTransactions: async (nextFilters) => {
      requestedFilters.push(nextFilters);
      return [];
    },
    readFilters: () => filters,
    render: () => {},
  });

  await load();
  filters = { search: '', startDate: '', endDate: '', category: '' };
  await load();

  assert.deepEqual(requestedFilters[1], filters);
});
