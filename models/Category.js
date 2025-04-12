// models/Category.js
const mongoose = require('mongoose');
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    slug: { type: String, unique: true, required: true },
    image: String,
    subcategories: [{
        name: { type: String, required: true },
        slug: { type: String, required: true },
        image: { type: String, default: '' } // Додаємо поле image
    }]
}, { timestamps: true });
module.exports = mongoose.model('Category', categorySchema);