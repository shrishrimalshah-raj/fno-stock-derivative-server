import express from 'express';

import PcrController from './controller';

const router = express.Router()

// health check
router.get('/health', (req, res) => res.send({message: "Pcr API Working"}))

// insert new data
router.post('/create', PcrController.create)

// test
// router.get('/test', PcrController.test)

router.get('/indexdata', PcrController.indexdata)

// stocklist
// router.get('/indexdata', PcrController.indexdata)

// stocklist by filter
// router.get('/stocklist/:filterCriteria', PcrController.getFutureStockList)

// seed data
// router.get('/seed', PcrController.seed)

// seed data
// router.get('/:stockName', PcrController.findByStockName)

// findById
// router.get('/:id', PcrController.findById)

// get all data
// router.get('/', PcrController.find)


export default router;
