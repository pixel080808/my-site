const mongoose = require('mongoose');
const sanitizeHtml = require('sanitize-html');

const productSchema = new mongoose.Schema({
    name: String,
    category: String,
    subcategory: String,
    price: Number,
    salePrice: Number,
    saleEnd: Date,
    brand: String,
    material: String,
    filters: [{ name: String, value: String }],
    photos: [String],
    visible: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    slug: String,
    type: String,
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

productSchema.pre('save', function(next) {
    if (this.description) {
        this.description = sanitizeHtml(this.description, {
            allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'li'],
            allowedAttributes: { 'a': ['href'] }
        });
    }
    next();
});

productSchema.index({ visible: 1, active: 1 });
productSchema.index({ category: 1, subcategory: 1 });

module.exports = mongoose.model('Product', productSchema);