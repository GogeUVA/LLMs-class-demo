'use strict';

const express = require('express');
const request = require('supertest');
const { createTransactionsRouter } = require('../src/transactions');
const { CATEGORIES, TRANSACTIONS } = require('./fixtures');

function buildApp(overrides = {}) {
  const app = express();
  app.use(
    '/transactions',
    createTransactionsRouter({
      getTransactions: async () => TRANSACTIONS,
      allowedCategories: CATEGORIES,
      ...overrides,
    })
  );
  app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error' }));
  return app;
}

const app = buildApp();
const ids = (res) => res.body.map((t) => t.id);

describe('GET /transactions with no filters (backward compatibility)', () => {
  test('returns every transaction as a plain array', async () => {
    const res = await request(app).get('/transactions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(ids(res)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('empty and whitespace-only params are ignored', async () => {
    const res = await request(app)
      .get('/transactions')
      .query({ search: '   ', startDate: '', endDate: '', category: '' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
  });

  test('unrelated params (e.g. from other issues) are ignored', async () => {
    const res = await request(app).get('/transactions').query({ page: 2, sort: 'amount' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
  });
});

describe('each filter independently', () => {
  test('search is case-insensitive', async () => {
    const res = await request(app).get('/transactions').query({ search: 'STARBUCKS' });
    expect(ids(res)).toEqual([1, 5]);
  });

  test('search with multiple words requires all words (any order)', async () => {
    const res = await request(app).get('/transactions').query({ search: 'coffee starbucks' });
    expect(ids(res)).toEqual([1]);
  });

  test('search trims and collapses extra whitespace', async () => {
    const res = await request(app).get('/transactions').query({ search: '  starbucks    reserve  ' });
    expect(ids(res)).toEqual([5]);
  });

  test.each([
    ['AT&T', [4]],
    ['#4B', [3]],
    ['(apt', [3]],
    ['café olé', [7]],
  ])('search handles special characters: %p', async (term, expected) => {
    const res = await request(app).get('/transactions').query({ search: term });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(expected);
  });

  test.each(['.*', '[', '\\', '$^', "' OR 1=1 --"])(
    'regex/injection-like input is treated literally: %p',
    async (term) => {
      const res = await request(app).get('/transactions').query({ search: term });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    }
  );

  test('startDate only (inclusive)', async () => {
    const res = await request(app).get('/transactions').query({ startDate: '2026-02-20' });
    expect(ids(res)).toEqual([5, 6, 7]);
  });

  test('endDate only includes the entire end day', async () => {
    const res = await request(app).get('/transactions').query({ endDate: '2026-03-01' });
    expect(ids(res)).toEqual([1, 2, 3, 4, 5, 6]); // #6 is 15:30 on 2026-03-01
  });

  test('startDate equal to endDate returns that single day', async () => {
    const res = await request(app).get('/transactions').query({ startDate: '2026-02-14', endDate: '2026-02-14' });
    expect(ids(res)).toEqual([4]);
  });

  test('category is case-insensitive', async () => {
    const res = await request(app).get('/transactions').query({ category: 'food' });
    expect(ids(res)).toEqual([1, 5, 7]);
  });
});

describe('multiple filters together', () => {
  test('date + category + search', async () => {
    const res = await request(app).get('/transactions').query({
      search: 'starbucks',
      category: 'Food',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([5]);
  });

  test('date range + category', async () => {
    const res = await request(app)
      .get('/transactions')
      .query({ category: 'food', startDate: '2026-01-01', endDate: '2026-02-28' });
    expect(ids(res)).toEqual([1, 5]);
  });
});

describe('zero-result responses', () => {
  test('search with no matches returns 200 and []', async () => {
    const res = await request(app).get('/transactions').query({ search: 'zzzz-no-match' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('valid category with no transactions returns 200 and []', async () => {
    const res = await request(app).get('/transactions').query({ category: 'Transport' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('filters that individually match but not together return []', async () => {
    const res = await request(app).get('/transactions').query({ search: 'starbucks', category: 'Housing' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('empty data set returns []', async () => {
    const res = await request(buildApp({ getTransactions: async () => [] }))
      .get('/transactions')
      .query({ search: 'anything' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('invalid parameters return 400', () => {
  test.each(['01/05/2026', '2026-1-5', '2026-02-30', 'yesterday', '2026-01-05T25:00:00Z'])(
    'invalid startDate %p',
    async (value) => {
      const res = await request(app).get('/transactions').query({ startDate: value });
      expect(res.status).toBe(400);
      expect(res.body.details[0].param).toBe('startDate');
    }
  );

  test('invalid endDate', async () => {
    const res = await request(app).get('/transactions').query({ endDate: 'not-a-date' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].param).toBe('endDate');
  });

  test('startDate after endDate', async () => {
    const res = await request(app).get('/transactions').query({ startDate: '2026-03-01', endDate: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toMatch(/on or after/);
  });

  test('unknown category lists allowed values', async () => {
    const res = await request(app).get('/transactions').query({ category: 'Crypto' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].param).toBe('category');
    expect(res.body.details[0].message).toMatch(/Allowed: Food/);
  });

  test('repeated parameter', async () => {
    const res = await request(app).get('/transactions?category=Food&category=Income');
    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toMatch(/only once/);
  });

  test('search longer than the limit', async () => {
    const res = await request(app).get('/transactions').query({ search: 'a'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body.details[0].param).toBe('search');
  });

  test('multiple invalid params are all reported', async () => {
    const res = await request(app).get('/transactions').query({ startDate: 'x', category: 'y' });
    expect(res.status).toBe(400);
    expect(res.body.details).toHaveLength(2);
  });
});

describe('integration hooks', () => {
  test('allowedCategories can be resolved per request (e.g. per-user categories)', async () => {
    const res = await request(buildApp({ allowedCategories: async () => ['Food'] }))
      .get('/transactions')
      .query({ category: 'Income' });
    expect(res.status).toBe(400);
  });

  test('formatResponse can wrap results without changing the default', async () => {
    const wrapped = buildApp({ formatResponse: (data) => ({ data, count: data.length }) });
    const res = await request(wrapped).get('/transactions').query({ category: 'Food' });
    expect(res.body.count).toBe(3);
  });

  test('data layer errors become 500 instead of crashing', async () => {
    const res = await request(buildApp({ getTransactions: async () => { throw new Error('db down'); } }))
      .get('/transactions');
    expect(res.status).toBe(500);
  });

  test('throws at startup if getTransactions is missing', () => {
    expect(() => createTransactionsRouter({})).toThrow(TypeError);
  });
});
