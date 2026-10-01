// In-memory transaction store (no database).
export const CATEGORIES = ['Food', 'Transport', 'Income', 'Shopping', 'Travel'];

export const SEED = [
  { id: 1, date: '2026-01-05', description: 'Starbucks Coffee', category: 'Food', amount: -4.5 },
  { id: 2, date: '2026-01-10', description: 'Uber Ride', category: 'Transport', amount: -18 },
  { id: 3, date: '2026-02-01', description: 'Salary', category: 'Income', amount: 2500 },
  { id: 4, date: '2026-02-14', description: 'Dinner @ Luigi\'s', category: 'Food', amount: -60 },
  { id: 5, date: '2026-03-02', description: '100% Cotton Store (sale)', category: 'Shopping', amount: -35 },
  { id: 6, date: '2026-03-15', description: 'Coffee Beans', category: 'Food', amount: -12 },
];

export function createStore(transactions = SEED) {
  return { list: () => transactions, categories: () => CATEGORIES };
}
