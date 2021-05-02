import express from "express";

import { BookRouter } from "./Book";
import { DerivativesRouter } from "./Derivatives";
import { PcrRouter } from "./Pcr";

const router = express.Router();

// BOOK ROUTES
router.use("/book", BookRouter);

// FNO ROUTES
router.use("/derivatives", DerivativesRouter);
router.use("/pcr", PcrRouter);

export default router;
