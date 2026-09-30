import { getViewState, hasActiveFilters } from './view.js';

export function createTransactionLoader({ getTransactions, readFilters, render }) {
  let activeController;
  let requestId = 0;

  return async function load() {
    const filters = readFilters();
    const filtersActive = hasActiveFilters(filters);
    const id = ++requestId;

    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    render(getViewState({ loading: true }));

    try {
      const transactions = await getTransactions(filters, { signal: controller.signal });
      if (id !== requestId) return;
      render(getViewState({ transactions, filtersActive }), transactions);
    } catch (error) {
      if (error.name === 'AbortError' || id !== requestId) return;
      render(getViewState({ error: error.message }));
    }
  };
}

