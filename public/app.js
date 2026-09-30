import { createTransactionLoader } from './transactionLoader.js';
import { getCategories, getTransactions } from './transactionsApi.js';
import { getViewState } from './view.js';

const $ = (id) => document.getElementById(id);
const fields = ['search', 'startDate', 'endDate', 'category'];
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

const load = createTransactionLoader({ getTransactions, readFilters, render });

async function init() {
  try {
    const categories = await getCategories();
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
