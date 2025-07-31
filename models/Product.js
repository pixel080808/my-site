const Joi = require('joi');
const mongoose = require('mongoose');
const sanitizeHtml = require('sanitize-html');
const Counter = require('./Counter');

const productSchema = new mongoose.Schema({
    id: { type: Number, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true }, // Тепер тут зберігається slug категорії, а не name
    subcategory: { 
        type: String, 
        trim: true,
        // Note: Stores the slug of the subcategory, not the name
    },
    price: { 
        type: Number, 
        min: 0,
        required: function() {
            return this.type === 'simple';
        }
    },
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
    slug: { type: String, required: true, unique: true, trim: true },
    type: { type: String, required: true, enum: ['simple', 'mattresses', 'group'] },
    sizes: [{
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        salePrice: { type: Number }, // Додаю це поле, якщо його не було
        saleEnd: { type: Date, default: null }
    }],
    colorBlocks: [{
        blockName: { type: String, required: true, default: 'Колір' },
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
        }]
    }],
    groupProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    description: { type: String, trim: true },
    widthCm: { type: Number, min: 0 },
    depthCm: { type: Number, min: 0 },
    heightCm: { type: Number, min: 0 },
    lengthCm: { type: Number, min: 0 },
    popularity: { type: Number, min: 0, default: 0 },
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    metaKeywords: { type: String, trim: true },
}, { timestamps: true });

productSchema.pre('save', async function(next) {
    try {
        if (!this.id) {
            const counter = await Counter.findOneAndUpdate(
                { _id: 'productId' },
                { $inc: { seq: 1 } },
                { new: true, upsert: true }
            );
            this.id = counter.seq;
        }
        next();
    } catch (err) {
        next(err);
    }
});

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

productSchema.pre('save', function(next) {
    if (this.description) {
        this.description = sanitizeHtml(this.description, {
            allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li', 'br'],
            allowedAttributes: { 'a': ['href'] }
        });
    }
    if ('_id' in this && !mongoose.Types.ObjectId.isValid(this._id)) {
        delete this._id;
    }
    if ('__v' in this) {
        delete this.__v;
    }
    next();
});

productSchema.index({ visible: 1, active: 1 });
productSchema.index({ category: 1, subcategory: 1 });

const Product = mongoose.model('Product', productSchema);

const productSchemaValidation = Joi.object({
    name: Joi.string().required().trim(),
    category: Joi.string().required().trim(),
    subcategory: Joi.string().trim().allow('').optional(),
    price: Joi.number().min(0).allow(null).optional(),
    salePrice: Joi.number().min(0).allow(null).optional(),
    saleEnd: Joi.date().allow(null).optional(),
    brand: Joi.string().trim().allow('').optional(),
    material: Joi.string().trim().allow('').optional(),
    filters: Joi.array().items(
        Joi.object({
            name: Joi.string().required().allow(''),
            value: Joi.string().required().allow('')
        })
    ).optional(),
    photos: Joi.array().items(
        Joi.string().uri().allow('', null).optional()
    ).optional(),
    visible: Joi.boolean().default(true),
    active: Joi.boolean().default(true),
    slug: Joi.string().required().trim().allow(''),
    type: Joi.string().valid('simple', 'mattresses', 'group').required(),
    sizes: Joi.array().items(
        Joi.object({
            name: Joi.string().required().allow(''),
            price: Joi.number().min(0).required(),
            salePrice: Joi.number().min(0).allow(null).optional(),
            saleEnd: Joi.date().allow(null).optional()
        })
    ).optional(),
    colorBlocks: Joi.array().items(
        Joi.object({
            blockName: Joi.string().required().default('Колір').allow(''),
            colors: Joi.array().items(
                Joi.object({
                    name: Joi.string().required().allow(''),
                    value: Joi.string().required().allow(''),
                    photo: Joi.string().uri().allow('').optional(),
                    priceChange: Joi.number().default(0)
                })
            ).required()
        })
    ).optional(),
    groupProducts: Joi.array().items(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/)
    ).optional(),
    description: Joi.string().trim().allow('').optional(),
    widthCm: Joi.number().min(0).allow(null).optional(),
    depthCm: Joi.number().min(0).allow(null).optional(),
    heightCm: Joi.number().min(0).allow(null).optional(),
    lengthCm: Joi.number().min(0).allow(null).optional(),
    popularity: Joi.number().min(0).default(0),
    metaTitle: Joi.string().trim().allow('').optional(),
    metaDescription: Joi.string().trim().allow('').optional(),
    metaKeywords: Joi.string().trim().allow('').optional(),
});

module.exports = { Product, productSchemaValidation };