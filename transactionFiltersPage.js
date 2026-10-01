'use strict';

const {
  normalizeFilters,
} = require('./src/transactions/normalizeTransactionFilters');
const {
  applyTransactionFilters,
  normalizeText,
} = require('./src/transactions/transactionFilters');
const {
  transactions,
  getAllowedCategoriesFromTransactions,
} = require('./transactionData');

const filters = {
  search: '',
  startDate: '',
  endDate: '',
  category: '',
};

const searchInput = document.getElementById('transaction-search');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const categorySelect = document.getElementById('category-filter');
const clearButton = document.getElementById('clear-filters');
const activeFilters = document.getElementById('active-filters');
const errorMessage = document.getElementById('filter-error');
const transactionList = document.getElementById('transaction-list');

function populateCategories() {
  const categories = getAllowedCategoriesFromTransactions(transactions);

  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });

  if (categories.length === 0) {
    categorySelect.disabled = true;

    if (categorySelect.options.length > 0) {
      categorySelect.options[0].textContent = 'No categories available';
    }
  }
}

function toActiveFilters(normalized) {
  const active = {};
  if (normalized.searchTerms) {
    active.searchTerms = normalized.searchTerms;
  }
  if (normalized.category) {
    active.category = normalizeText(normalized.category);
  }
  if (normalized.startDate !== undefined) {
    active.startDate = normalized.startDate;
  }
  if (normalized.endDate !== undefined) {
    active.endDate = normalized.endDate;
  }
  return active;
}

function validateAndNormalize() {
  return normalizeFilters(
    {
      search: filters.search,
      startDate: filters.startDate,
      endDate: filters.endDate,
      category: filters.category,
    },
    { allowedCategories: getAllowedCategoriesFromTransactions(transactions) }
  );
}

function filterTransactions() {
  renderActiveFilters();

  const { filters: normalized, errors } = validateAndNormalize();
  errorMessage.textContent = '';

  const rangeError = errors.find((e) => e.code === 'INVALID_RANGE');
  if (rangeError) {
    errorMessage.textContent = 'Start date cannot be later than end date.';
    renderInvalidDateState();
    return;
  }

  const blocking = errors.filter((e) => e.code !== 'SEARCH_TOO_LONG');
  if (blocking.length > 0) {
    errorMessage.textContent = blocking[0].message;
    renderInvalidDateState();
    return;
  }

  if (errors.some((e) => e.code === 'SEARCH_TOO_LONG')) {
    errorMessage.textContent = errors.find((e) => e.code === 'SEARCH_TOO_LONG').message;
  }

  const filtered = applyTransactionFilters(transactions, toActiveFilters(normalized));
  renderTransactions(filtered);
}

function renderTransactions(items) {
  transactionList.innerHTML = '';

  if (items.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';

    const message = document.createElement('p');
    message.textContent = 'No matching transactions.';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Clear filters';
    button.addEventListener('click', clearFilters);

    noResults.append(message, button);
    transactionList.appendChild(noResults);

    return;
  }

  items.forEach((transaction) => {
    const item = document.createElement('div');
    item.className = 'transaction';

    const description = document.createElement('strong');
    description.textContent = transaction.description;

    const date = document.createElement('span');
    date.textContent = transaction.date;

    const category = document.createElement('span');
    category.textContent = transaction.category;

    item.append(description, date, category);
    transactionList.appendChild(item);
  });
}

function renderInvalidDateState() {
  transactionList.innerHTML = '';

  const invalidState = document.createElement('div');
  invalidState.className = 'no-results';

  const message = document.createElement('p');
  message.textContent = 'Please correct the invalid date range.';

  invalidState.appendChild(message);
  transactionList.appendChild(invalidState);
}

function renderActiveFilters() {
  const labels = [];

  if (filters.search) {
    labels.push(`Search: "${filters.search}"`);
  }

  if (filters.startDate) {
    labels.push(`From: ${filters.startDate}`);
  }

  if (filters.endDate) {
    labels.push(`To: ${filters.endDate}`);
  }

  if (filters.category) {
    labels.push(`Category: ${filters.category}`);
  }

  activeFilters.textContent = labels.length
    ? `Active filters: ${labels.join(' | ')}`
    : 'No active filters';

  clearButton.disabled = labels.length === 0;
}

function clearFilters() {
  filters.search = '';
  filters.startDate = '';
  filters.endDate = '';
  filters.category = '';

  searchInput.value = '';
  startDateInput.value = '';
  endDateInput.value = '';
  categorySelect.value = '';

  errorMessage.textContent = '';

  filterTransactions();
}

searchInput.addEventListener('input', (event) => {
  filters.search = event.target.value;
  filterTransactions();
});

startDateInput.addEventListener('change', (event) => {
  filters.startDate = event.target.value;
  filterTransactions();
});

endDateInput.addEventListener('change', (event) => {
  filters.endDate = event.target.value;
  filterTransactions();
});

categorySelect.addEventListener('change', (event) => {
  filters.category = event.target.value;
  filterTransactions();
});

clearButton.addEventListener('click', clearFilters);

populateCategories();
filterTransactions();
