const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    brand: { type: String },
    price: { type: Number },
    salePrice: { type: Number },
    saleEnd: { type: String },
    slug: { type: String },
    url: { type: String },
    category: { type: String },
    subcategory: { type: String },
    type: { type: String },
    visible: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    photos: [{ type: String }],
    material: { type: String },
    colors: [{
        name: { type: String },
        value: { type: String },
        priceChange: { type: Number },
        photo: { type: String }
    }],
    widthCm: { type: Number },
    depthCm: { type: Number },
    heightCm: { type: Number },
    lengthCm: { type: Number },
    description: { type: String },
    sizes: [{
        name: { type: String },
        price: { type: Number }
    }],
    groupProducts: [{ type: Number }]
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);