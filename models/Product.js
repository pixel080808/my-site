const mongoose = require('mongoose');
const sanitizeHtml = require('sanitize-html');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    subcategory: { type: String, trim: true },
    price: { type: Number },
    salePrice: { type: Number },
    saleEnd: { type: Date },
    brand: { type: String, trim: true },
    material: { type: String, trim: true },
    filters: [{
        name: { type: String, required: true },
        value: { type: String, required: true }
        // У server.js потрібно додати в productSchemaValidation:
        // filters: Joi.array().items(Joi.object({ name: Joi.string().required(), value: Joi.string().required() })).default([])
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
    slug: { type: String, unique: true, trim: true },
    type: { type: String, enum: ['simple', 'mattresses', 'group'] },
    sizes: [{ name: String, price: Number }],
    colors: [{
        name: String,
        value: String,
        photo: {
            type: String,
            validate: {
                validator: function(v) {
                return !v || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
                },
                message: 'Color photo must be a valid URL or null'
            }
        },
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

// Перевірка існування groupProducts
productSchema.pre('save', async function(next) {
    const product = this;
    if (product.groupProducts && product.groupProducts.length > 0) {
        const existingProducts = await mongoose.models.Product.find({ _id: { $in: product.groupProducts } });
        if (existingProducts.length !== product.groupProducts.length) {
            throw new Error('Деякі продукти в groupProducts не існують');
        }
    }
    next();
});

// Захист від XSS у description
productSchema.pre('save', function(next) {
    if (this.description) {
        this.description = sanitizeHtml(this.description, {
            allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'li'],
            allowedAttributes: { 'a': ['href'] }
        });
    }
    next();
});

// Індекси
productSchema.index({ visible: 1, active: 1 });
productSchema.index({ category: 1, subcategory: 1 });

module.exports = mongoose.model('Product', productSchema);