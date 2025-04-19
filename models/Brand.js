// models/Brand.js
const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
}, { timestamps: true });

// Додаємо індекс
brandSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Brand', brandSchema);