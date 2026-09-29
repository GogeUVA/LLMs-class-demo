const transactions = [
  { id: 1, description: "Chipotle", date: "2026-09-20", category: "Food" },
  { id: 2, description: "Uber", date: "2026-09-21", category: "Transportation" },
  { id: 3, description: "Target", date: "2026-09-25", category: "Shopping" },
  { id: 4, description: "Spotify", date: "2026-09-27", category: "Entertainment" }
];

const filters = {
  search: "",
  startDate: "",
  endDate: "",
  category: ""
};

// Elements
const searchInput = document.getElementById("transaction-search");
const startDateInput = document.getElementById("start-date");
const endDateInput = document.getElementById("end-date");
const categorySelect = document.getElementById("category-filter");
const clearButton = document.getElementById("clear-filters");
const activeFilters = document.getElementById("active-filters");
const errorMessage = document.getElementById("filter-error");
const transactionList = document.getElementById("transaction-list");

// Populate category dropdown
function populateCategories() {
  const categories = [
    ...new Set(
      transactions
        .map(transaction => transaction.category)
        .filter(Boolean)
    )
  ].sort();

  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });

  // Edge case: no categories available
  if (categories.length === 0) {
    categorySelect.disabled = true;

    if (categorySelect.options.length > 0) {
      categorySelect.options[0].textContent = "No categories available";
    }
  }
}

// Validate filter inputs
function validateFilters() {
  errorMessage.textContent = "";

  if (
    filters.startDate &&
    filters.endDate &&
    filters.startDate > filters.endDate
  ) {
    errorMessage.textContent =
      "Start date cannot be later than end date.";

    return false;
  }

  return true;
}

// Issue #1 uses local filtering only.
// A later issue can replace this with an API request.
function filterTransactions() {
  renderActiveFilters();

  if (!validateFilters()) {
    renderInvalidDateState();
    return;
  }

  const filtered = transactions.filter(transaction => {
    const matchesSearch =
      !filters.search ||
      transaction.description
        .toLowerCase()
        .includes(filters.search.toLowerCase());

    const matchesStartDate =
      !filters.startDate ||
      transaction.date >= filters.startDate;

    const matchesEndDate =
      !filters.endDate ||
      transaction.date <= filters.endDate;

    const matchesCategory =
      !filters.category ||
      transaction.category === filters.category;

    return (
      matchesSearch &&
      matchesStartDate &&
      matchesEndDate &&
      matchesCategory
    );
  });

  renderTransactions(filtered);
}

// Render transaction history
function renderTransactions(items) {
  transactionList.innerHTML = "";

  // Edge case: filters return zero transactions
  if (items.length === 0) {
    const noResults = document.createElement("div");
    noResults.className = "no-results";

    const message = document.createElement("p");
    message.textContent = "No matching transactions.";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Clear filters";
    button.addEventListener("click", clearFilters);

    noResults.append(message, button);
    transactionList.appendChild(noResults);

    return;
  }

  items.forEach(transaction => {
    const item = document.createElement("div");
    item.className = "transaction";

    const description = document.createElement("strong");
    description.textContent = transaction.description;

    const date = document.createElement("span");
    date.textContent = transaction.date;

    const category = document.createElement("span");
    category.textContent = transaction.category;

    item.append(description, date, category);
    transactionList.appendChild(item);
  });
}

// Display a clear state when the date range is invalid
function renderInvalidDateState() {
  transactionList.innerHTML = "";

  const invalidState = document.createElement("div");
  invalidState.className = "no-results";

  const message = document.createElement("p");
  message.textContent = "Please correct the invalid date range.";

  invalidState.appendChild(message);
  transactionList.appendChild(invalidState);
}

// Show user which filters are currently active
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
    ? `Active filters: ${labels.join(" | ")}`
    : "No active filters";

  clearButton.disabled = labels.length === 0;
}

// Clear all filters
function clearFilters() {
  filters.search = "";
  filters.startDate = "";
  filters.endDate = "";
  filters.category = "";

  searchInput.value = "";
  startDateInput.value = "";
  endDateInput.value = "";
  categorySelect.value = "";

  errorMessage.textContent = "";

  filterTransactions();
}

// Event listeners
searchInput.addEventListener("input", event => {
  filters.search = event.target.value.trim();
  filterTransactions();
});

startDateInput.addEventListener("change", event => {
  filters.startDate = event.target.value;
  filterTransactions();
});

endDateInput.addEventListener("change", event => {
  filters.endDate = event.target.value;
  filterTransactions();
});

categorySelect.addEventListener("change", event => {
  filters.category = event.target.value;
  filterTransactions();
});

clearButton.addEventListener("click", clearFilters);

// Initialize
populateCategories();
filterTransactions();