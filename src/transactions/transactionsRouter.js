'use strict';

const express = require('express');
const {
  parseTransactionFilters,
  applyTransactionFilters,
  FilterValidationError,
} = require('./transactionFilters');

/**
 * @param {object} config
 * @param {(req) => Promise<object[]>|object[]} config.getTransactions
 * @param {string[] | ((req) => Promise<string[]>|string[])} [config.allowedCategories]
 * @param {string[]} [config.searchFields]
 * @param {(txn) => any} [config.getDate]
 * @param {(txn) => any} [config.getCategory]
 * @param {(results, filters, req) => any} [config.formatResponse]
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
      return next(err);
    }
  });

  return router;
}

module.exports = { createTransactionsRouter };
