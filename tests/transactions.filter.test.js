import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, SEED, EMPTY_CATEGORY } from './helpers/server.js';

let api;
let base;
before(async () => {
  if (process.env.TEST_API_URL) return void (base = process.env.TEST_API_URL);
  api = await startApi();
  base = api.url;
});
after(() => api?.close());

async function get(params = {}, baseUrl = base) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${baseUrl}/transactions${qs ? `?${qs}` : ''}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body, list: body?.transactions };
}
const ids = (list) => list.map((t) => t.id).sort((a, b) => a - b);

describe('unfiltered history', () => {
  test('returns the full history', async () => {
    const { status, list } = await get();
    assert.equal(status, 200);
    assert.deepEqual(ids(list), ids(SEED));
  });
});

describe('search', () => {
  test('matches description text, case-insensitively', async () => {
    const { list } = await get({ search: 'coffee' });
    assert.deepEqual(ids(list), [1, 6]);
  });
  test('special characters are treated literally', async () => {
    for (const [search, expected] of [
      ["Luigi's", [4]], ['@', [4]], ['100%', [5]], ['(sale)', [5]],
      ['.*', []], ['[', []], ['<script>', []], ["'; DROP TABLE transactions;--", []],
    ]) {
      const { status, list } = await get({ search });
      assert.equal(status, 200, `search=${search}`);
      assert.deepEqual(ids(list), expected, `search=${search}`);
    }
  });
  test('no matches returns an empty list, not an error', async () => {
    const { status, list } = await get({ search: 'zzz-no-such-thing' });
    assert.equal(status, 200);
    assert.deepEqual(list, []);
  });
});

describe('date filter', () => {
  test('start and end dates are inclusive', async () => {
    const { list } = await get({ startDate: '2026-01-10', endDate: '2026-02-14' });
    assert.deepEqual(ids(list), [2, 3, 4]);
  });
  test('start date only', async () => {
    const { list } = await get({ startDate: '2026-03-01' });
    assert.deepEqual(ids(list), [5, 6]);
  });
  test('end date only', async () => {
    const { list } = await get({ endDate: '2026-01-10' });
    assert.deepEqual(ids(list), [1, 2]);
  });
  test('range with no transactions returns empty list', async () => {
    const { status, list } = await get({ startDate: '2025-01-01', endDate: '2025-01-31' });
    assert.equal(status, 200);
    assert.deepEqual(list, []);
  });
  test('start after end is rejected with a 4xx and error message', async () => {
    const { status, body } = await get({ startDate: '2026-03-01', endDate: '2026-01-01' });
    assert.ok(status >= 400 && status < 500);
    assert.ok(body?.error);
  });
  test('malformed date is rejected with a 4xx', async () => {
    const { status } = await get({ startDate: 'not-a-date' });
    assert.ok(status >= 400 && status < 500);
  });
});

describe('category filter', () => {
  test('returns only that category', async () => {
    const { list } = await get({ category: 'Food' });
    assert.deepEqual(ids(list), [1, 4, 6]);
    assert.ok(list.every((t) => t.category === 'Food'));
  });
  test('category with no transactions returns empty list', async () => {
    const { status, list } = await get({ category: EMPTY_CATEGORY });
    assert.equal(status, 200);
    assert.deepEqual(list, []);
  });
});

describe('combined filters', () => {
  test('search + category + date range are ANDed', async () => {
    const { list } = await get({ search: 'coffee', category: 'Food', startDate: '2026-02-01', endDate: '2026-12-31' });
    assert.deepEqual(ids(list), [6]);
  });
  test('every result satisfies every active filter', async () => {
    const f = { category: 'Food', startDate: '2026-01-01', endDate: '2026-02-28' };
    const { list } = await get(f);
    assert.deepEqual(ids(list), [1, 4]);
    for (const t of list) {
      assert.equal(t.category, f.category);
      assert.ok(t.date >= f.startDate && t.date <= f.endDate);
    }
  });
  test('conflicting filters yield an empty list', async () => {
    const { list } = await get({ category: 'Income', search: 'coffee' });
    assert.deepEqual(list, []);
  });
});

describe('clearing filters', () => {
  test('dropping all params restores the original list', async () => {
    const original = await get();
    const filtered = await get({ category: 'Food', search: 'coffee', startDate: '2026-01-01' });
    assert.ok(filtered.list.length < original.list.length);
    const cleared = await get();
    assert.deepEqual(cleared.list, original.list);
  });
  test('empty-string params behave like no filter', async () => {
    const original = await get();
    const cleared = await get({ search: '', category: '', startDate: '', endDate: '' });
    assert.deepEqual(cleared.list, original.list);
  });
});

describe('API / network failure', () => {
  test('server error surfaces as a 5xx the client can detect', async () => {
    const failing = await startApi({ failing: true });
    try {
      const { status } = await get({ category: 'Food' }, failing.url);
      assert.equal(status, 500);
    } finally {
      await failing.close();
    }
  });
  test('unreachable server rejects the request', async () => {
    const dead = await startApi();
    const url = dead.url;
    await dead.close();
    await assert.rejects(fetch(`${url}/transactions`));
  });
});
