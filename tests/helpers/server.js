import { createApp } from '../../src/server.js';
import { createStore } from '../../src/transactions.js';

export { SEED } from '../../src/transactions.js';
export const EMPTY_CATEGORY = 'Travel'; // valid category with zero transactions

// Starts the real app on a random port. `failing` makes the store throw (-> 500).
export function startApi({ failing = false } = {}) {
  const store = failing
    ? { list() { throw new Error('boom'); }, categories: () => [] }
    : createStore();
  const server = createApp({ store });
  return new Promise((resolve) =>
    server.listen(0, () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((r) => server.close(r)),
    })));
}
