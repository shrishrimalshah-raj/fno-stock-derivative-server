import express from 'express';

import DerivativesController from './controller';

const router = express.Router()

// health check
router.get('/health', (req, res) => res.send({message: "Book API Working"}))

// insert new data
router.post('/create', DerivativesController.create)

// test
router.get('/test', DerivativesController.test)

// stocklist
router.get('/stocklist', DerivativesController.stocklist)

// stocklist
router.get('/indexdata', DerivativesController.indexdata)

// stocklist by filter
router.get('/stocklist/:filterCriteria', DerivativesController.getFutureStockList)

// seed data
router.get('/seed', DerivativesController.seed)

// seed data
router.get('/:stockName', DerivativesController.findByStockName)

// findById
router.get('/:id', DerivativesController.findById)

// get all data
router.get('/', DerivativesController.find)


export default router;
