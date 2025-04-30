const mongoose = require('mongoose');
const sanitizeHtml = require('sanitize-html');

const productSchema = new mongoose.Schema({
    name: { type: String, trim: true }, // Removed required
    category: { type: String, trim: true }, // Removed required
    subcategory: { type: String, trim: true },
    price: { type: Number },
    salePrice: { type: Number },
    saleEnd: { type: Date },
    brand: { type: String, trim: true },
    material: { type: String, trim: true },
    filters: [{
        name: { type: String }, // Removed required
        value: { type: String } // Removed required
    }],
    photos: [{
        type: String,
        // Removed URL validator to allow any string
    }],
    visible: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    slug: { type: String, unique: true, trim: true }, // Kept unique, but can remove if duplicates are okay
    type: { type: String, enum: ['simple', 'mattresses', 'group'] }, // Removed required by not specifying default
    sizes: [{ name: String, price: Number }],
    colors: [{
        name: String,
        value: String,
        photo: { type: String }, // Removed URL validator
        priceChange: Number
    }],
    groupProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    description: String,
    widthCm: Number,
    depthCm: Number,
    heightCm: Number,
    lengthCm: Number,
    popularity: Number
}, { timestamps: true });

// Перевірка існування groupProducts (послаблюємо: не кидаємо помилку, а очищаємо)
productSchema.pre('save', async function(next) {
    const product = this;
    if (product.groupProducts && product.groupProducts.length > 0) {
        const existingProducts = await mongoose.models.Product.find({ _id: { $in: product.groupProducts } });
        if (existingProducts.length !== product.groupProducts.length) {
            logger.warn('Деякі продукти в groupProducts не існують, очищаємо');
            product.groupProducts = []; // Очищаємо замість помилки
        }
    }
    next();
});

// Захист від XSS у description (залишаємо для безпеки)
productSchema.pre('save', function(next) {
    if (this.description) {
        this.description = sanitizeHtml(this.description, {
            allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'li'],
            allowedAttributes: { 'a': ['href'] }
        });
    }
    next();
});

// Індекси (залишаємо для продуктивності)
productSchema.index({ visible: 1, active: 1 });
productSchema.index({ category: 1, subcategory: 1 });

module.exports = mongoose.model('Product', productSchema);