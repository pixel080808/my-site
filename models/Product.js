const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, trim: true, required: true },
    category: { type: String, required: true, trim: true },
    subcategory: { type: String, trim: true, default: null },
    brand: { type: String, trim: true, default: null },
    material: { type: String, trim: true, default: null },
    price: { type: Number, min: 0, default: null },
    salePrice: { type: Number, min: 0, default: null },
    saleEnd: { type: Date, default: null },
    description: { type: String, trim: true, default: null },
    widthCm: { type: Number, min: 0, default: null },
    depthCm: { type: Number, min: 0, default: null },
    heightCm: { type: Number, min: 0, default: null },
    lengthCm: { type: Number, min: 0, default: null },
    photos: [{ type: String, trim: true }],
    colors: [{
        name: { type: String, required: true, trim: true },
        value: { type: String, required: true, trim: true },
        priceChange: { type: Number, default: 0 },
        photo: { type: String, trim: true, default: '' }
    }],
    sizes: [{
        name: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0 }
    }],
    groupProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    filters: [{
        name: { type: String, required: true },
        value: { type: String, required: true }
    }],
    type: { type: String, enum: ['simple', 'mattresses', 'group'], required: true },
    active: { type: Boolean, default: true },
    visible: { type: Boolean, default: true },
    popularity: { type: Number, default: 0 }
});

productSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model('Product', productSchema);