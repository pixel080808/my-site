const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
}, { timestamps: true });

module.exports = mongoose.model('Material', materialSchema);