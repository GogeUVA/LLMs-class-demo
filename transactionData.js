'use strict';

const transactions = [
  { id: 1, description: 'Chipotle', date: '2026-09-20', category: 'Food' },
  { id: 2, description: 'Uber', date: '2026-09-21', category: 'Transportation' },
  { id: 3, description: 'Target', date: '2026-09-25', category: 'Shopping' },
  { id: 4, description: 'Spotify', date: '2026-09-27', category: 'Entertainment' },
];

/**
 * Derives allowed categories from transaction rows (demo UI source of truth).
 * @param {object[]} rows
 * @returns {string[]}
 */
function getAllowedCategoriesFromTransactions(rows = transactions) {
  return [...new Set(rows.map((t) => t.category).filter(Boolean))].sort();
}

module.exports = { transactions, getAllowedCategoriesFromTransactions };
