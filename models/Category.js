// models/Category.js
const mongoose = require('mongoose');
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    slug: { type: String, unique: true, required: true }, // Додано
    img: String,
    subcategories: [{ name: String, slug: String }] // Додано slug для підкатегорій
}, { timestamps: true });
module.exports = mongoose.model('Category', categorySchema);