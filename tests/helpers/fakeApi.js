// Stand-in for GET /transactions, built from an ASSUMED contract:
//   GET /transactions?search=&startDate=&endDate=&category=
//   200 -> { transactions: [{ id, date: 'YYYY-MM-DD', description, category, amount }] }
//   400 -> { error } when startDate > endDate or a date is malformed
// Set TEST_API_URL to run the same tests against the real backend instead.
import http from 'node:http';

export const SEED = [
  { id: 1, date: '2026-01-05', description: 'Starbucks Coffee', category: 'Food', amount: -4.5 },
  { id: 2, date: '2026-01-10', description: 'Uber Ride', category: 'Transport', amount: -18 },
  { id: 3, date: '2026-02-01', description: 'Salary', category: 'Income', amount: 2500 },
  { id: 4, date: '2026-02-14', description: 'Dinner @ Luigi\'s', category: 'Food', amount: -60 },
  { id: 5, date: '2026-03-02', description: '100% Cotton Store (sale)', category: 'Shopping', amount: -35 },
  { id: 6, date: '2026-03-15', description: 'Coffee Beans', category: 'Food', amount: -12 },
];
export const EMPTY_CATEGORY = 'Travel'; // valid category with zero transactions

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function startFakeApi({ failWith } = {}) {
  const server = http.createServer((req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (failWith) return send(failWith, { error: 'Internal Server Error' });
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/transactions') return send(404, { error: 'not found' });
    const q = url.searchParams;
    const [search, start, end, category] = ['search', 'startDate', 'endDate', 'category'].map((k) => q.get(k));
    for (const d of [start, end]) if (d && !ISO.test(d)) return send(400, { error: 'invalid date' });
    if (start && end && start > end) return send(400, { error: 'invalid date range' });
    const out = SEED.filter((t) =>
      (!search || t.description.toLowerCase().includes(search.toLowerCase())) &&
      (!start || t.date >= start) && (!end || t.date <= end) &&
      (!category || t.category === category));
    send(200, { transactions: out });
  });
  return new Promise((resolve) =>
    server.listen(0, () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((r) => server.close(r)),
    })));
}
