const mongoose = require('mongoose');

const subcategorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true },
    photo: { type: String, default: '' },
    visible: { type: Boolean, default: true }
});

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true },
    photo: { type: String, default: '' },
    visible: { type: Boolean, default: true },
    subcategories: [subcategorySchema],
    order: { type: Number, default: 0 }
});

module.exports = mongoose.model('Category', categorySchema);