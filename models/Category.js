// models/Category.js
const mongoose = require('mongoose');
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    slug: { type: String, unique: true, required: true },
    image: String, // Змінено з img
    subcategories: [{ name: String, slug: String }]
}, { timestamps: true });
module.exports = mongoose.model('Category', categorySchema);