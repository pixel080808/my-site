// models/Material.js
const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
}, { timestamps: true });

// Додаємо індекс
materialSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Material', materialSchema);