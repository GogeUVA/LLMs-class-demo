import { getViewState, hasActiveFilters, buildQuery } from './view.js';

const $ = (id) => document.getElementById(id);
const fields = ['search', 'startDate', 'endDate', 'category'];
let requestId = 0;

const readFilters = () => Object.fromEntries(fields.map((f) => [f, $(f).value]));

function render(state, transactions = []) {
  const status = $('status');
  const table = $('table');
  status.hidden = state.kind === 'list';
  status.className = state.kind === 'error' ? 'error' : '';
  status.textContent = state.message ?? '';
  table.hidden = state.kind !== 'list';
  const rows = $('rows');
  rows.replaceChildren(...transactions.map((t) => {
    const tr = document.createElement('tr');
    // textContent (not innerHTML) so descriptions with markup/special chars render literally
    for (const text of [t.date, t.description, t.category, t.amount.toFixed(2)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    tr.lastChild.className = `amount ${t.amount < 0 ? 'neg' : 'pos'}`;
    return tr;
  }));
}

async function load() {
  const filters = readFilters();
  const filtersActive = hasActiveFilters(filters);
  const id = ++requestId;
  render(getViewState({ loading: true }));
  try {
    const res = await fetch(`/transactions${buildQuery(filters)}`);
    const body = await res.json().catch(() => ({}));
    if (id !== requestId) return; // a newer request superseded this one
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    render(getViewState({ transactions: body.transactions, filtersActive }), body.transactions);
  } catch (err) {
    if (id !== requestId) return;
    render(getViewState({ error: err.message }));
  }
}

async function init() {
  try {
    const { categories } = await (await fetch('/categories')).json();
    for (const c of categories) $('category').add(new Option(c, c));
  } catch { /* category list is optional; filtering still works */ }
  for (const f of fields) $(f).addEventListener(f === 'search' ? 'input' : 'change', load);
  $('clear').addEventListener('click', () => {
    for (const f of fields) $(f).value = '';
    load();
  });
  load();
}
init();
