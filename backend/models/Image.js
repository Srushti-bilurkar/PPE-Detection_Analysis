const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  name: String,
  data: String,
  contentType: String,
  batchNumber: Number,
  imgRange: String,
  personCount: Number,
  date: String,
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Image', imageSchema);