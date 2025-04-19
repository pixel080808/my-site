const mongoose = require('mongoose');

const subcategorySchema = new mongoose.Schema({
    name: { type: String, required: false, default: '' }, // Зроблено необов'язковим
    slug: { type: String, required: false, default: '' }, // Зроблено необов'язковим
    photo: { type: String, default: '' },
    visible: { type: Boolean, default: true }
});

const categorySchema = new mongoose.Schema({
    name: { type: String, required: false, default: '' }, // Зроблено необов'язковим
    slug: { type: String, required: false, default: '' }, // Зроблено необов'язковим
    photo: { type: String, default: '' },
    visible: { type: Boolean, default: true },
    subcategories: [subcategorySchema],
    order: { type: Number, default: 0 }
});

// Оптимізація індексів
categorySchema.index({ slug: 1 }, { unique: true, sparse: true }); // Додано sparse для уникнення конфліктів із порожніми slug
categorySchema.index({ 'subcategories.slug': 1 }, { sparse: true }); // Додано sparse
categorySchema.index({ order: 1 });

module.exports = mongoose.model('Category', categorySchema);