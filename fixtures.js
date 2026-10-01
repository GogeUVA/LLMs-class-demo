'use strict';

const CATEGORIES = ['Food', 'Groceries', 'Housing', 'Utilities', 'Income', 'Transport'];

const TRANSACTIONS = [
  { id: 1, date: '2026-01-05', description: 'Starbucks Coffee', category: 'Food', amount: -5.75 },
  { id: 2, date: '2026-01-15', description: 'Whole Foods Market', category: 'Groceries', amount: -82.1 },
  { id: 3, date: '2026-02-01', description: 'Rent: Feb (Apt #4B)', category: 'Housing', amount: -1400 },
  { id: 4, date: '2026-02-14', description: 'AT&T Wireless bill', category: 'Utilities', amount: -65 },
  { id: 5, date: '2026-02-20', description: 'Starbucks Reserve', category: 'Food', amount: -9.25 },
  { id: 6, date: '2026-03-01T15:30:00Z', description: 'Paycheck ACME Corp', category: 'Income', amount: 2500 },
  { id: 7, date: '2026-03-10', description: 'Café Olé', category: 'Food', amount: -12, notes: 'lunch with team' },
];

module.exports = { CATEGORIES, TRANSACTIONS };
