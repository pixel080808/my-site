const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    type: { type: String, enum: ['simple', 'mattresses', 'group'], required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    brand: { type: String, default: '' },
    category: { type: String, required: true },
    subcategory: { type: String, default: '' },
    material: { type: String, default: '' },
    price: { type: Number },
    salePrice: { type: Number },
    saleEnd: { type: String },
    description: { type: String, default: '' },
    widthCm: { type: Number },
    depthCm: { type: Number },
    heightCm: { type: Number },
    lengthCm: { type: Number },
    photos: [{ type: String }],
    colors: [{
        name: { type: String, required: true },
        value: { type: String, required: true },
        priceChange: { type: Number, default: 0 },
        photo: { type: String },
    }],
    sizes: [{
        name: { type: String, required: true },
        price: { type: Number, required: true },
    }],
    groupProducts: [{ type: String }],
    active: { type: Boolean, default: true },
    visible: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);