'use strict';

const express = require('express');
const { createTransactionsRouter } = require('../src/transactions');
const { CATEGORIES } = require('../fixtures');

const db = [
  { id: 1, userId: 'u1', date: '2026-01-05', description: 'Starbucks Coffee', category: 'Food', amount: -5.75 },
  { id: 2, userId: 'u1', date: '2026-01-15', description: 'Whole Foods Market', category: 'Groceries', amount: -82.1 },
  { id: 3, userId: 'u1', date: '2026-02-01', description: 'Rent: Feb (Apt #4B)', category: 'Housing', amount: -1400 },
  { id: 4, userId: 'u2', date: '2026-02-03', description: "Someone else's coffee", category: 'Food', amount: -4 },
];

const app = express();

app.use((req, _res, next) => {
  req.user = { id: 'u1' };
  next();
});

app.use(
  '/transactions',
  createTransactionsRouter({
    getTransactions: async (req) => db.filter((t) => t.userId === req.user.id),
    allowedCategories: CATEGORIES,
  })
);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
