'use strict';

const express = require('express');
const {
  parseTransactionFilters,
  applyTransactionFilters,
  FilterValidationError,
} = require('./transactionFilters');

/**
 * Builds the router for GET /transactions with search/date/category filters.
 *
 * Everything that depends on other issues (data access, auth, categories,
 * response shape) is injected, so this file never needs to be edited to plug
 * into the rest of the app.
 *
 * Mount it with:  app.use('/transactions', createTransactionsRouter({...}))
 *
 * @param {object} config
 * @param {(req) => Promise<object[]>|object[]} config.getTransactions
 *        REQUIRED. Returns the current user's transactions (owned by the data/auth layer).
 * @param {string[] | ((req) => Promise<string[]>|string[])} [config.allowedCategories]
 *        Valid categories. When provided, unknown categories return 400.
 * @param {string[]} [config.searchFields] Fields the search matches against.
 * @param {(txn) => any} [config.getDate] Reads a transaction's date.
 * @param {(txn) => any} [config.getCategory] Reads a transaction's category.
 * @param {(results, filters, req) => any} [config.formatResponse]
 *        Shapes the 200 body. Defaults to the plain array so existing
 *        clients that call GET /transactions without filters keep working.
 */
function createTransactionsRouter(config = {}) {
  const {
    getTransactions,
    allowedCategories,
    searchFields,
    getDate,
    getCategory,
    formatResponse = (results) => results,
  } = config;

  if (typeof getTransactions !== 'function') {
    throw new TypeError('createTransactionsRouter requires a getTransactions(req) function.');
  }

  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const categories =
        typeof allowedCategories === 'function'
          ? await allowedCategories(req)
          : allowedCategories;

      let filters;
      try {
        filters = parseTransactionFilters(req.query, { allowedCategories: categories });
      } catch (err) {
        if (err instanceof FilterValidationError) {
          return res.status(400).json({ error: err.message, details: err.details });
        }
        throw err;
      }

      const transactions = (await getTransactions(req)) || [];
      const results = applyTransactionFilters(transactions, filters, {
        searchFields,
        getDate,
        getCategory,
      });

      return res.status(200).json(formatResponse(results, filters, req));
    } catch (err) {
      return next(err); // Express 4 does not catch async errors on its own
    }
  });

  return router;
}

module.exports = { createTransactionsRouter };
