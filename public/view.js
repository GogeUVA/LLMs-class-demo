// Pure helpers deciding what the history list shows.
export function getViewState({ loading, error, transactions, filtersActive }) {
  if (loading) return { kind: 'loading', message: 'Loading transactions…' };
  if (error) return { kind: 'error', message: `Could not load transactions: ${error}` };
  if (!transactions.length) {
    return {
      kind: 'empty',
      message: filtersActive ? 'No transactions match your filters.' : 'No transactions yet.',
    };
  }
  return { kind: 'list' };
}

export function hasActiveFilters(f) {
  return Boolean(f.search?.trim() || f.startDate || f.endDate || f.category);
}

export function buildQuery(f) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && String(v).trim()) p.set(k, String(v).trim());
  const s = p.toString();
  return s ? `?${s}` : '';
}
