import mongoose from "mongoose";
import moment from "moment";
import { BookService } from "../../service/Book";
import Papa from "papaparse";
import extract from "extract-zip";
import axios from "axios";
import fs from "fs";
import path from "path";

import { STOCK_WISE_LOT_SIZE } from "./constants/StockWiseLotSize";
import { DerivativeModel, PcrModel } from "../../db/models";

class PcrController {
  async seed(req, res) {
    const DerivativesObject = new DerivativesController();
    let date = "26FEB2021";
    var destinationFile = path.join(__dirname, `${date}.zip`);
    const countDocuments = await DerivativeModel.countDocuments({});

    // https://archives.nseindia.com/content/historical/DERIVATIVES/2021/JAN/fo22JAN2021bhav.csv.zip
    try {
      const fileUrl = `https://archives.nseindia.com/content/historical/DERIVATIVES/2021/FEB/fo${date}bhav.csv.zip`;
      const response = await axios.get(fileUrl, {
        responseType: "stream",
      });
      await DerivativesObject.httpResponseToFile(response, destinationFile);
      await extract(destinationFile, { dir: __dirname });
      const data = await DerivativesObject.convertFileTOData(
        path.join(__dirname, `fo${date}bhav.csv`)
      );

      // STEP 1: filter stocks open interest data for future stocks and index
      const filterData = data.filter((item) => {
        return (
          item["INSTRUMENT"] === "FUTIDX" || item["INSTRUMENT"] === "FUTSTK"
        );
      });

      // STEP 2: filtering data for index option nearest strike is considered
      const optionsFilterData = data.filter((item) => {
        return item["INSTRUMENT"] === "OPTIDX";
      });

      const stocksFilterData = data.filter((item) => {
        return item["INSTRUMENT"] === "OPTSTK";
      });

      // get nearest strike
      const indexNearestExpirationDate = optionsFilterData[0]["EXPIRY_DT"];
      const stockNearestExpirationDate = stocksFilterData[0]["EXPIRY_DT"];

      // console.log('a', stockNearestExpirationDate)

      // filter all data nearest strike
      const allOptionIndexData = optionsFilterData.filter((item) => {
        return item["EXPIRY_DT"] === indexNearestExpirationDate;
      });

      const allOptionStockData = stocksFilterData.filter((item) => {
        return item["EXPIRY_DT"] === stockNearestExpirationDate;
      });

      // find unique keys from all of objects
      const uniqueIndexStock = [
        ...new Set(allOptionIndexData.map((item) => item.SYMBOL)),
      ];

      const uniqueFutureStock = [
        ...new Set(allOptionStockData.map((item) => item.SYMBOL)),
      ];

      // console.log('b', uniqueFutureStock)

      //IMP DATA
      const combineOptionDataArray = [];
      const getDataByUniqueSymbol = (symbol, data) => {
        const symbolData = data.filter((item) => {
          return item["SYMBOL"] === symbol;
        });

        const filterCallData = symbolData.filter((item) => {
          return item["OPTION_TYP"] === "CE";
        });

        const filterPutData = symbolData.filter((item) => {
          return item["OPTION_TYP"] === "PE";
        });

        //callData
        const additionCallData = filterCallData.reduce((acc, curr) => {
          if (Object.keys(acc).length === 0) {
            return curr;
          }

          acc = {
            ...acc,
            OPEN_INT: Number(acc["OPEN_INT"]) + Number(curr["OPEN_INT"]),
            CHG_IN_OI: Number(acc["CHG_IN_OI"]) + Number(curr["CHG_IN_OI"]),
          };

          return acc;
        }, {});

        //putData
        const additionPutData = filterPutData.reduce((acc, curr) => {
          if (Object.keys(acc).length === 0) {
            return curr;
          }

          acc = {
            ...acc,
            OPEN_INT: Number(acc["OPEN_INT"]) + Number(curr["OPEN_INT"]),
            CHG_IN_OI: Number(acc["CHG_IN_OI"]) + Number(curr["CHG_IN_OI"]),
          };

          return acc;
        }, {});

        const { EXPIRY_DT, SYMBOL } = additionCallData;
        const combineCallPut = {
          SYMBOL,
          OPTION_EXPIRY_DT: EXPIRY_DT,
          CALL_OPEN_INT:
            additionCallData["OPEN_INT"] / STOCK_WISE_LOT_SIZE[symbol]
              ? additionCallData["OPEN_INT"] / STOCK_WISE_LOT_SIZE[symbol]
              : 0,
          PUT_OPEN_INT:
            additionPutData["OPEN_INT"] / STOCK_WISE_LOT_SIZE[symbol]
              ? additionPutData["OPEN_INT"] / STOCK_WISE_LOT_SIZE[symbol]
              : 0,
          CALL_CHG_IN_OI:
            additionCallData["CHG_IN_OI"] / STOCK_WISE_LOT_SIZE[symbol]
              ? additionCallData["CHG_IN_OI"] / STOCK_WISE_LOT_SIZE[symbol]
              : 0,
          PUT_CHG_IN_OI:
            additionPutData["CHG_IN_OI"] / STOCK_WISE_LOT_SIZE[symbol]
              ? additionPutData["CHG_IN_OI"] / STOCK_WISE_LOT_SIZE[symbol]
              : 0,
          PCR:
            additionPutData["OPEN_INT"] /
            STOCK_WISE_LOT_SIZE[symbol] /
            (additionCallData["OPEN_INT"] / STOCK_WISE_LOT_SIZE[symbol])
              ? additionPutData["OPEN_INT"] /
                STOCK_WISE_LOT_SIZE[symbol] /
                (additionCallData["OPEN_INT"] / STOCK_WISE_LOT_SIZE[symbol])
              : 0,
        };

        combineOptionDataArray.push(combineCallPut);
      };

      uniqueIndexStock.forEach((sym) =>
        getDataByUniqueSymbol(sym, allOptionIndexData)
      );
      uniqueFutureStock.forEach((sym) =>
        getDataByUniqueSymbol(sym, allOptionStockData)
      );

      // unique.forEach(sym => console.log(sym));

      // console.log("unique ****", unique);
      // console.log("allOptionIndexData ****", allOptionIndexData.length);

      // STEP 2: combine stocks by their symbol
      const tempObj = {};
      filterData.forEach((item) => {
        if (tempObj[item["SYMBOL"]]) {
          tempObj[item["SYMBOL"]].push(item);
        } else {
          tempObj[item["SYMBOL"]] = [item];
        }
      });

      //STEP 3: combine all different objects into single stock/fno {} object for storing into DB
      let mostImpArray = [];
      for (let obj in tempObj) {
        //array
        let transformObject = tempObj[obj].reduce((acc, curr) => {
          // 1st iteration
          if (Object.keys(acc).length === 0) {
            return curr;
          }

          //2nd iteration
          acc = {
            ...acc,
            OPEN_INT:
              Number(acc["OPEN_INT"]) + Number(curr["OPEN_INT"])
                ? Number(acc["OPEN_INT"]) + Number(curr["OPEN_INT"])
                : 0,
            CHG_IN_OI:
              Number(acc["CHG_IN_OI"]) + Number(curr["CHG_IN_OI"])
                ? Number(acc["CHG_IN_OI"]) + Number(curr["CHG_IN_OI"])
                : 0,
          };

          return acc;
        }, {});

        mostImpArray.push(transformObject);
      }

      //STEP 4: convert all OPEN_INT, CHG_IN_OI divide by original lot size
      mostImpArray = mostImpArray.map((stock) => {
        stock = {
          ...stock,
          OPEN: Number(stock["OPEN"]),
          HIGH: Number(stock["HIGH"]),
          LOW: Number(stock["LOW"]),
          CLOSE: Number(stock["CLOSE"]),
          OPEN_INT:
            stock["OPEN_INT"] / STOCK_WISE_LOT_SIZE[stock["SYMBOL"]]
              ? stock["OPEN_INT"] / STOCK_WISE_LOT_SIZE[stock["SYMBOL"]]
              : 0,
          CHG_IN_OI:
            stock["CHG_IN_OI"] / STOCK_WISE_LOT_SIZE[stock["SYMBOL"]]
              ? stock["CHG_IN_OI"] / STOCK_WISE_LOT_SIZE[stock["SYMBOL"]]
              : 0,
        };

        return stock;
      });

      let finalLastArray = [];

      function round(value) {
        return Math.round(value * 100) / 100;
      }

      combineOptionDataArray.forEach((option) => {
        let stock = mostImpArray.find(
          (stock) => stock.SYMBOL === option.SYMBOL
        );

        stock = {
          ...option,
          ...stock,
          PCR: round(option.PCR, 2) ? round(option.PCR, 2) : 0,
          DIFF_PUT_CALL:
            Number(option.PUT_OPEN_INT) - Number(option.CALL_OPEN_INT)
              ? Number(option.PUT_OPEN_INT) - Number(option.CALL_OPEN_INT)
              : 0,
        };

        finalLastArray.push(stock);
      });

      // calculate % change in OI

      function percentageChange(todayOI, yesterdayOI) {
        const percentageChange = ((todayOI - yesterdayOI) / yesterdayOI) * 100;
        return round(percentageChange);
      }

      if (countDocuments !== 0) {
        finalLastArray = finalLastArray.map(async (stock) => {
          // const [lastRecord] = await DerivativeModel.find({
          //   SYMBOL: stock.SYMBOL,
          // })
          //   .sort({ TIMESTAMP: -1 })
          //   .limit(1);

          const allUniqueTimestamp = await DerivativeModel.distinct(
            "TIMESTAMP"
          );
          const tempArray = [];
          allUniqueTimestamp.forEach((date) => {
            tempArray.push({ TIMESTAMP: date });
          });

          let sortedArray = tempArray.sort(function (a, b) {
            return new Date(a.TIMESTAMP) - new Date(b.TIMESTAMP);
          });

          const lastRecord = await DerivativeModel.findOne({
            SYMBOL: stock.SYMBOL,
            TIMESTAMP: sortedArray[sortedArray.length - 1].TIMESTAMP,
          });

          return {
            ...stock,
            CHG_IN_OI_PER: percentageChange(
              stock.OPEN_INT,
              lastRecord?.OPEN_INT ? lastRecord.OPEN_INT : 0
            )
              ? percentageChange(
                  stock.OPEN_INT,
                  lastRecord?.OPEN_INT ? lastRecord.OPEN_INT : 0
                )
              : 0,
            CALL_CHG_IN_OI_PER: percentageChange(
              stock.CALL_OPEN_INT,
              lastRecord?.CALL_OPEN_INT ? lastRecord.CALL_OPEN_INT : 0
            )
              ? percentageChange(
                  stock.CALL_OPEN_INT,
                  lastRecord?.CALL_OPEN_INT ? lastRecord.CALL_OPEN_INT : 0
                )
              : 0,
            PUT_CHG_IN_OI_PER: percentageChange(
              stock.PUT_OPEN_INT,
              lastRecord?.PUT_OPEN_INT ? lastRecord.PUT_OPEN_INT : 0
            )
              ? percentageChange(
                  stock.PUT_OPEN_INT,
                  lastRecord?.PUT_OPEN_INT ? lastRecord.PUT_OPEN_INT : 0
                )
              : 0,
            CLOSE_PER: percentageChange(
              stock.CLOSE,
              lastRecord?.CLOSE ? lastRecord.CLOSE : 0
            )
              ? percentageChange(
                  stock.CLOSE,
                  lastRecord?.CLOSE ? lastRecord.CLOSE : 0
                )
              : 0,
            DAY_PRICE_CHG: round(stock.CLOSE - lastRecord?.CLOSE || 0),
            CREATED_AT: new Date(),
          };
        });

        finalLastArray = await Promise.all(finalLastArray);
      }

      // insertMany documents in mongoose
      DerivativeModel.insertMany(finalLastArray)
        .then(function () {
          console.log("Data inserted"); // Success
        })
        .catch(function (error) {
          console.log(error); // Failure
        });

      // combineOptionDataArray
      res.send(finalLastArray);

      // await this.seedDataIntoDB(data, date);
      // fs.unlinkSync(destinationFile)
    } catch (error) {
      console.log("ERROR **********", error);
    }
  }

  async convertFileTOData(fileCSV) {
    // let file = fs.readFileSync(fileCSV, "utf8").toString().split("\n");
    // file.shift();
    // file.pop();
    // file = file.join("\n");

    let file = fs.readFileSync(fileCSV, "utf8");
    // file.shift();
    // file.pop();
    // file = file.join("\n");

    let data;
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          data = results.data;
        },
      });
      resolve(data);
    });
  }

  async httpResponseToFile(response, destination) {
    const writer = fs.createWriteStream(destination);

    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      let error = null;
      writer.on("error", (err) => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on("close", () => {
        if (!error) {
          resolve(true);
        }
      });
    });
  }

  async stocklist(req, res) {
    try {
      const stocksList = await DerivativeModel.distinct("SYMBOL");
      return res
        .status(200)
        .json({ message: "test query executed", data: stocksList });
    } catch (error) {
      return res.status(500).json({ error: error });
    }
  }

  async find(req, res) {
    try {
      const data = await DerivativeModel.find();
      return res.status(200).json({ message: "Data fetch successfully", data });
    } catch (error) {
      return res.status(500).json({ error: error });
    }
  }

  sortArray(array) {
    return array.sort(function (a, b) {
      return new Date(a.TIMESTAMP) - new Date(b.TIMESTAMP);
    });
  }

  async findByStockName(req, res) {
    const { stockName = "BANKNIFTY" } = req.params;
    try {
      let data = await DerivativeModel.find({ SYMBOL: stockName })
        .sort({ TIMESTAMP: -1 })
        .limit(22);
      const DerivativesObject = new DerivativesController();
      data = DerivativesObject.sortArray(data);
      return res.status(200).json({ message: "Data fetch successfully", data, closeArray });
    } catch (error) {
      return res.status(500).json({ error: error });
    }
  }

  async findById(req, res) {
    const { id } = req.params;
    try {
      const data = await BookService.findById(id);
      return res.status(200).json({ message: "Data fetch successfully", data });
    } catch (error) {
      return res.status(500).json({ error: error });
    }
  }

  async create(req, res) {
    const { data } = req.body;

    try {
      const doc = await PcrModel.findOne({ TIMESTAMP: data.TIMESTAMP });
      if (doc) {
        return res.status(200).json({ message: "Data already inserted" });
      }

      const response = await PcrModel.create(data);
      return res.status(201).json({ message: "New record created", response });
    } catch (error) {
      console.log("error", error);
      return res.status(500).json({ error: error });
    }
  }

  async test(req, res) {
    try {
      // const result = await DerivativeModel.find({});

      // let updateAllData = result.map(async (stock, idx) => {
      //   try {
      //     let timestamp = new Date(stock.TIMESTAMP);

      //     const doc = await DerivativeModel.findOne({ _id: stock._id });

      //     doc.TIMESTAMP = timestamp;

      //     return await doc.save();
      //   } catch (err) {
      //     console.log("idx", idx);
      //     console.log("error", err);
      //     console.log("stock", stock);
      //   }
      // });

      // updateAllData = await Promise.all(updateAllData);

      const allUniqueTimestamp = await DerivativeModel.distinct("TIMESTAMP");

      const tempArray = [];

      allUniqueTimestamp.forEach((date) => {
        tempArray.push({ TIMESTAMP: date });
      });

      let sortedArray = tempArray.sort(function (a, b) {
        return new Date(a.TIMESTAMP) - new Date(b.TIMESTAMP);
      });

      sortedArray = sortedArray.slice(
        sortedArray.length - 5,
        sortedArray.length
      );

      return res
        .status(200)
        .json({ message: "test query executed", result: sortedArray });
    } catch (error) {
      return res.status(500).json({ error: error });
    }
  }

  async indexdata(req, res) {
    try {
      let data = await PcrModel.find({}).sort({ CREATED_AT: 1 }).limit(200);

      const NIFTY = data.map((item) => item.NIFTY);
      const BANKNIFTY = data.map((item) => item.BANKNIFTY);
      const FINNIFTY = data.map((item) => item.FINNIFTY);

      return res.status(200).json({ NIFTY, BANKNIFTY, FINNIFTY });
    } catch (error) {
      return res.status(500).json({ error: error });
    }
  }

  async getFutureStockList(req, res) {
    // const [lastRecord] = await DerivativeModel.find()
    //   .sort({ TIMESTAMP: -1 })
    //   .limit(1);

    const allUniqueTimestamp = await DerivativeModel.distinct("TIMESTAMP");
    const tempArray = [];
    allUniqueTimestamp.forEach((date) => {
      tempArray.push({ TIMESTAMP: date });
    });

    let sortedArray = tempArray.sort(function (a, b) {
      return new Date(a.TIMESTAMP) - new Date(b.TIMESTAMP);
    });

    const lastRecord = await DerivativeModel.findOne({
      SYMBOL: "BANKNIFTY",
      TIMESTAMP: sortedArray[sortedArray.length - 1].TIMESTAMP,
    });

    try {
      const { filterCriteria = "maxOpenInterest" } = req.params;
      if (filterCriteria === "maxOpenInterest") {
        const result = await DerivativeModel.find({
          TIMESTAMP: lastRecord.TIMESTAMP,
        }).sort({
          OPEN_INT: -1,
        });
        return res.status(200).json(result);
      } else if (filterCriteria === "pcrLessThan") {
        const result = await DerivativeModel.find({
          PCR: { $ne: 0 },
          PCR: { $gt: 0.0, $lt: 0.5 },
          OPEN_INT: { $gt: 0 },
          TIMESTAMP: lastRecord.TIMESTAMP,
        }).sort({ PCR: -1 });

        return res.status(200).json(result);
      } else if (filterCriteria === "pcrMoreThan") {
        const result = await DerivativeModel.find({
          PCR: { $ne: 0 },
          PCR: { $gt: 1 },
          OPEN_INT: { $gt: 0 },
          TIMESTAMP: lastRecord.TIMESTAMP,
        }).sort({ PCR: -1 });

        return res.status(200).json(result);
      } else if (filterCriteria === "maxPCR") {
        const result = await DerivativeModel.find({
          TIMESTAMP: lastRecord.TIMESTAMP,
        }).sort({ PCR: -1 });

        return res.status(200).json(result);
      } else if (filterCriteria === "chgInOICALL") {
        const result = await DerivativeModel.find({
          TIMESTAMP: lastRecord.TIMESTAMP,
        }).sort({ CALL_CHG_IN_OI: -1 });

        return res.status(200).json(result);
      } else if (filterCriteria === "chgInOIPUT") {
        const result = await DerivativeModel.find({
          TIMESTAMP: lastRecord.TIMESTAMP,
        }).sort({ PUT_CHG_IN_OI: -1 });

        return res.status(200).json(result);
      } else if (filterCriteria === "chgInOIFUTURE") {
        const result = await DerivativeModel.find({
          TIMESTAMP: lastRecord.TIMESTAMP,
        }).sort({ CHG_IN_OI: -1 });

        return res.status(200).json(result);
      } else if (filterCriteria === "longBuildUp") {
        const result = await DerivativeModel.aggregate([
          { $match: { TIMESTAMP: lastRecord.TIMESTAMP } },
          { $sort: { CLOSE_PER: -1, CHG_IN_OI_PER: -1 } },
        ]);

        return res.status(200).json(result);
      } else if (filterCriteria === "shortBuildUp") {
        const result = await DerivativeModel.aggregate([
          { $match: { TIMESTAMP: lastRecord.TIMESTAMP } },
          { $sort: { CLOSE_PER: 1, CHG_IN_OI_PER: -1 } },
        ]);

        return res.status(200).json(result);
      } else if (filterCriteria === "longUnwinding") {
        const result = await DerivativeModel.aggregate([
          { $match: { TIMESTAMP: lastRecord.TIMESTAMP } },
          { $sort: { CLOSE_PER: 1, CHG_IN_OI_PER: 1 } },
        ]);

        return res.status(200).json(result);
      } else if (filterCriteria === "shortCovering") {
        const result = await DerivativeModel.aggregate([
          { $match: { TIMESTAMP: lastRecord.TIMESTAMP } },
          { $sort: { CLOSE_PER: -1, CHG_IN_OI_PER: 1 } },
        ]);

        return res.status(200).json(result);
      } else if (filterCriteria === "maxPutCall") {
        const result = await DerivativeModel.aggregate([
          { $match: { TIMESTAMP: lastRecord.TIMESTAMP } },
          { $sort: { DIFF_PUT_CALL: -1 } },
        ]);

        return res.status(200).json(result);
      } else if (filterCriteria === "minPutCall") {
        const result = await DerivativeModel.aggregate([
          { $match: { TIMESTAMP: lastRecord.TIMESTAMP } },
          { $sort: { DIFF_PUT_CALL: 1 } },
        ]);

        return res.status(200).json(result);
      } else if (filterCriteria === "maxClosePer") {
        const result = await DerivativeModel.aggregate([
          { $match: { TIMESTAMP: lastRecord.TIMESTAMP } },
          { $sort: { DAY_PRICE_CHG: -1 } },
        ]);

        return res.status(200).json(result);
      } else if (filterCriteria === "minClosePer") {
        const result = await DerivativeModel.aggregate([
          { $match: { TIMESTAMP: lastRecord.TIMESTAMP } },
          { $sort: { DAY_PRICE_CHG: 1 } },
        ]);

        return res.status(200).json(result);
      }
    } catch (error) {
      return res.status(500).json({ error: error });
    }
  }
}

export default new PcrController();
