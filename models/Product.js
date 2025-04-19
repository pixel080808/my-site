const mongoose = require('mongoose');
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    subcategory: { type: String },
    price: { type: Number },
    salePrice: { type: Number },
    saleEnd: { type: Date },
    brand: { type: String },
    material: { type: String },
    photos: [String],
    visible: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    slug: { type: String, unique: true },
    type: { type: String, enum: ['simple', 'mattresses', 'group'] },
    sizes: [{ name: String, price: Number }],
    colors: [{ name: String, value: String, photo: String, priceChange: Number }],
    groupProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    description: String,
    widthCm: Number,
    depthCm: Number,
    heightCm: Number,
    lengthCm: Number,
    popularity: Number
}, { timestamps: true });

// Додаємо індекси
productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ visible: 1, active: 1 });
productSchema.index({ category: 1, subcategory: 1 });

module.exports = mongoose.model('Product', productSchema);