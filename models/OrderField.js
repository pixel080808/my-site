const mongoose = require('mongoose');

const orderFieldSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['text', 'email', 'select'] },
    options: [{ type: String, trim: true }],
}, { timestamps: true });

module.exports = mongoose.model('OrderField', orderFieldSchema);