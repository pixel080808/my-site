const mongoose = require('mongoose');
const sanitizeHtml = require('sanitize-html');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    subcategory: { type: String, trim: true },
    price: { type: Number, min: 0 }, // Додано min для уникнення від’ємних цін
    salePrice: { type: Number, min: 0 },
    saleEnd: { type: Date },
    brand: { type: String, trim: true },
    material: { type: String, trim: true },
    filters: [{
        name: { type: String, required: true },
        value: { type: String, required: true }
    }],
    photos: [{
        type: String,
        validate: {
            validator: function(v) {
                return !v || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
            },
            message: 'Photo must be a valid URL'
        }
    }],
    visible: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    slug: { type: String, required: true, unique: true, trim: true }, // Додано required
    type: { type: String, required: true, enum: ['simple', 'mattresses', 'group'] }, // Додано required
    sizes: [{
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 }
    }],
    colors: [{
        name: { type: String, required: true },
        value: { type: String, required: true },
        photo: {
            type: String,
            validate: {
                validator: function(v) {
                    return !v || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
                },
                message: 'Color photo must be a valid URL or null'
            }
        },
        priceChange: { type: Number, default: 0 }
    }],
    groupProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    description: { type: String, trim: true },
    widthCm: { type: Number, min: 0 },
    depthCm: { type: Number, min: 0 },
    heightCm: { type: Number, min: 0 },
    lengthCm: { type: Number, min: 0 },
    popularity: { type: Number, min: 0, default: 0 }
}, { timestamps: true });

// Middleware для видалення поля id перед збереженням
productSchema.pre('save', function(next) {
    if ('id' in this) {
        delete this.id;
    }
    next();
});

// Перевірка існування groupProducts
productSchema.pre('save', async function(next) {
    try {
        if (this.groupProducts && this.groupProducts.length > 0) {
            const existingProducts = await mongoose.models.Product.find({ _id: { $in: this.groupProducts } });
            if (existingProducts.length !== this.groupProducts.length) {
                throw new Error('Деякі продукти в groupProducts не існують');
            }
        }
        next();
    } catch (err) {
        next(err);
    }
});

// Захист від XSS у description
productSchema.pre('save', function(next) {
    if (this.description) {
        this.description = sanitizeHtml(this.description, {
            allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'li', 'br', 'div', 'span'],
            allowedAttributes: { 'a': ['href'], 'div': ['style'], 'span': ['style'] }
        });
    }
    next();
});

// Індекси
productSchema.index({ visible: 1, active: 1 });
productSchema.index({ category: 1, subcategory: 1 });

module.exports = mongoose.model('Product', productSchema);