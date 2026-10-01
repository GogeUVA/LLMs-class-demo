// Shared, pure filter utilities for transaction history.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s) {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Normalizes raw filter values (strings, possibly empty) and validates them.
// Returns { filters } on success or { error } on failure.
export function parseFilters({ search, startDate, endDate, category } = {}) {
  const filters = {
    search: (search ?? '').trim(),
    startDate: startDate ?? '',
    endDate: endDate ?? '',
    category: category ?? '',
  };
  for (const key of ['startDate', 'endDate']) {
    if (filters[key] && !isValidDate(filters[key])) return { error: `Invalid ${key}: expected YYYY-MM-DD` };
  }
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    return { error: 'Invalid date range: startDate is after endDate' };
  }
  return { filters };
}

// All active filters are ANDed. Search is a literal, case-insensitive substring match.
export function filterTransactions(transactions, { search, startDate, endDate, category }) {
  const needle = (search ?? '').trim().toLowerCase();
  return transactions.filter((t) =>
    (!needle || t.description.toLowerCase().includes(needle)) &&
    (!startDate || t.date >= startDate) &&
    (!endDate || t.date <= endDate) &&
    (!category || t.category === category));
}
