const mongoose = require("mongoose");

const fareSchema = new mongoose.Schema(
  {
    route: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    advance_days: { type: Number, enum: [1, 15, 30], required: true },
    carrier: { type: String, required: true },
    base_fare: { type: Number, required: true },
    taxes: { type: Number, required: true },
    udf: { type: Number, required: true },
    convenience_fee: { type: Number, required: true },
    total_fare: { type: Number, required: true },
    source: { type: String, required: true },
    spike: { type: Boolean, default: false },
  },
  { collection: "fares" },
);

const weightSchema = new mongoose.Schema(
  {
    route: { type: String, required: true, unique: true },
    weight: { type: Number, required: true, min: 0, max: 1 },
  },
  { collection: "weights" },
);

const benchmarkSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, unique: true }, // "2026-07"
    avg_fare: { type: Number, required: true },
  },
  { collection: "dgca_benchmark" },
);

const dailyIndexSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, unique: true },
    index_value: { type: Number, required: true },
    pct_change: { type: Number, required: true },
    top_contributor_route: { type: String },
    explanation_text: { type: String },
    spikes: [{ route: String, pct_change: Number }],
  },
  { collection: "daily_index" },
);

module.exports = {
  Fare: mongoose.model("Fare", fareSchema),
  Weight: mongoose.model("Weight", weightSchema),
  DgcaBenchmark: mongoose.model("DgcaBenchmark", benchmarkSchema),
  DailyIndex: mongoose.model("DailyIndex", dailyIndexSchema),
};
