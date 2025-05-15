const Joi = require('joi');
const mongoose = require('mongoose');
const sanitizeHtml = require('sanitize-html');
const Counter = require('./Counter');

const productSchema = new mongoose.Schema({
    id: { type: Number, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    subcategory: { type: String, trim: true },
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
    subcategory: Joi.string().trim().optional(),
    price: Joi.number().min(0).required().when('type', {
        is: 'simple',
        then: Joi.required(),
        otherwise: Joi.allow(null)
    }),
    salePrice: Joi.number().min(0).optional(),
    saleEnd: Joi.date().optional(),
    brand: Joi.string().trim().optional(),
    material: Joi.string().trim().optional(),
    filters: Joi.array().items(
        Joi.object({
            name: Joi.string().required(),
            value: Joi.string().required()
        })
    ).optional(),
    photos: Joi.array().items(
        Joi.string().uri().allow('').optional()
    ).min(1).required(), // Додано min(1), щоб вимагати хоча б одне фото
    visible: Joi.boolean().default(true),
    active: Joi.boolean().default(true),
    slug: Joi.string().required().trim(),
    type: Joi.string().valid('simple', 'mattresses', 'group').required(),
    sizes: Joi.array().items(
        Joi.object({
            name: Joi.string().required(),
            price: Joi.number().min(0).required()
        })
    ).optional(),
    colors: Joi.array().items(
        Joi.object({
            name: Joi.string().required(),
            value: Joi.string().required(),
            photo: Joi.string().uri().allow('').optional(),
            priceChange: Joi.number().default(0)
        })
    ).optional(),
    groupProducts: Joi.array().items(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/)
    ).optional(),
    description: Joi.string().trim().optional(),
    widthCm: Joi.number().min(0).optional(),
    depthCm: Joi.number().min(0).optional(),
    heightCm: Joi.number().min(0).optional(),
    lengthCm: Joi.number().min(0).optional(),
    popularity: Joi.number().min(0).default(0)
});

const productPartialSchemaValidation = Joi.object({
    name: Joi.string().min(1).max(255).trim(),
    category: Joi.string().max(100).trim(),
    subcategory: Joi.string().max(255).allow('').trim(),
    price: Joi.number().min(0),
    salePrice: Joi.number().min(0),
    saleEnd: Joi.date().allow(null),
    brand: Joi.string().max(100).allow('').trim(),
    material: Joi.string().max(100).allow('').trim(),
    filters: Joi.array().items(
        Joi.object({
            name: Joi.string().required(),
            value: Joi.string().required()
        })
    ),
    photos: Joi.array().items(Joi.string().uri().allow('')),
    visible: Joi.boolean(),
    active: Joi.boolean(),
    slug: Joi.string().min(1).max(255).trim(),
    type: Joi.string().valid('simple', 'mattresses', 'group'),
    sizes: Joi.array().items(
        Joi.object({
            name: Joi.string().max(100).required().trim(),
            price: Joi.number().min(0).required()
        })
    ),
    colors: Joi.array().items(
        Joi.object({
            name: Joi.string().max(100).required().trim(),
            value: Joi.string().max(100).required().trim(),
            priceChange: Joi.number().default(0),
            photo: Joi.string().uri().allow('', null)
        })
    ),
    groupProducts: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)),
    description: Joi.string().allow('').trim(),
    widthCm: Joi.number().min(0).allow(null),
    depthCm: Joi.number().min(0).allow(null),
    heightCm: Joi.number().min(0).allow(null),
    lengthCm: Joi.number().min(0).allow(null),
    popularity: Joi.number().min(0)
}).unknown(false);

module.exports = { Product, productSchemaValidation, productPartialSchemaValidation };