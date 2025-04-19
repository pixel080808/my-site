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

// Додаємо індекси
categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ 'subcategories.slug': 1 });
categorySchema.index({ order: 1 });

module.exports = mongoose.model('Category', categorySchema);