const FILTER_KEYS = ['search', 'startDate', 'endDate', 'category'];

export function buildTransactionQuery(filters = {}) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value && String(value).trim()) params.set(key, String(value).trim());
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export async function getTransactions(filters, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`/transactions${buildTransactionQuery(filters)}`, { signal });
  const body = await readJson(response);
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  if (!Array.isArray(body.transactions)) throw new Error('Invalid transactions response.');
  return body.transactions;
}

export async function getCategories({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl('/categories');
  const body = await readJson(response);
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return Array.isArray(body.categories) ? body.categories : [];
}
