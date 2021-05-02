import mongoose from "mongoose";

const Schema = mongoose.Schema;

const PcrSchema = new Schema({
  NIFTY: { type: Schema.Types.Mixed, required: false },
  BANKNIFTY: { type: Schema.Types.Mixed, required: false },
  FINNIFTY: { type: Schema.Types.Mixed, required: false },
  CREATED_AT: { type: Date, required: false, default: new Date() },
  TIMESTAMP: { type: String, required: false },
});

const PcrModel = mongoose.model("Pcr", PcrSchema);
export default PcrModel;
