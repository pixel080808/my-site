const mongoose = require('mongoose');
const Joi = require('joi');
const Counter = require('./Counter');

const orderSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    cartId: {
        type: String,
        default: '',
        validate: {
            validator: function(v) {
                return v === '' || /^cart-[a-z0-9]{9}$/.test(v);
            },
            message: 'cartId must be in format cart-xxxxxxxxx (9 alphanumeric characters) or empty string'
        }
    },
    date: { type: Date, default: Date.now },
    customer: {
        type: {
            name: { type: String, required: true, minlength: 1, maxlength: 255 },
            surname: { type: String, minlength: 1, maxlength: 255 },
            email: {
                type: String,
                default: '',
                validate: {
                    validator: function(v) {
                        return v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
                    },
                    message: 'Email must be a valid email address or empty string'
                }
            },
            phone: {
                type: String,
                default: '',
                validate: {
                    validator: function(v) {
                        return v === '' || /^(0\d{9})$|^(\+?\d{10,15})$/.test(v);
                    },
                    message: 'Phone must be in format 0XXXXXXXXX or +380XXXXXXXXX (10-15 digits) or empty string'
                }
            },
            address: { type: String, default: '' },
            payment: { type: String, default: '' }
        },
        required: true
    },
    items: [{
        id: { type: Number, required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
        photo: {
            type: String,
            default: '',
            validate: {
                validator: function(v) {
                    return v === '' || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
                },
                message: 'Photo must be a valid URL or empty string'
            }
        },
        color: {
            type: {
                name: { type: String },
                value: { type: String },
                priceChange: { type: Number, default: 0 },
                photo: {
                    type: String,
                    default: null,
                    validate: {
                        validator: function(v) {
                            return v === null || v === '' || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
                        },
                        message: 'Color photo must be a valid URL, empty string, or null'
                    }
                }
            },
            default: null
        },
        size: { type: String, default: null }
    }],
    total: { 
        type: Number, 
        required: true, 
        min: 0
    },
    status: { 
        type: String, 
        default: 'Нове замовлення',
        enum: ['Нове замовлення', 'В обробці', 'Відправлено', 'Доставлено', 'Скасовано']
    }
}, { timestamps: true });

orderSchema.pre('save', async function(next) {
    try {
        if (!this.id) {
            const counter = await Counter.findOneAndUpdate(
                { _id: 'orderId' },
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

orderSchema.index({ date: -1 });

const orderSchemaValidation = Joi.object({
    id: Joi.number().optional(),
    cartId: Joi.string()
        .pattern(/^cart-[a-z0-9]{9}$/)
        .allow('')
        .optional()
        .messages({
            'string.pattern.base': 'cartId must be in format cart-xxxxxxxxx (9 alphanumeric characters) or empty string'
        }),
    date: Joi.date().default(Date.now),
    customer: Joi.object({
        name: Joi.string().min(1).max(255).required(),
        surname: Joi.string().min(1).max(255).optional(),
        email: Joi.string().email().allow('').optional(),
        phone: Joi.string()
            .pattern(/^(0\d{9})$|^(\+?\d{10,15})$/)
            .allow('')
            .optional(),
        address: Joi.string().allow('').optional(),
        payment: Joi.string().allow('').optional()
    }).required(),
    items: Joi.array().items(
        Joi.object({
            id: Joi.number().required(),
            name: Joi.string().required(),
            quantity: Joi.number().min(1).required(),
            price: Joi.number().min(0).required(),
            photo: Joi.string().uri().allow('').optional(),
            color: Joi.object({
                name: Joi.string().allow('').optional(),
                value: Joi.string().allow('').optional(),
                priceChange: Joi.number().default(0),
                photo: Joi.string().uri().allow('', null).optional()
            }).allow(null).optional(),
            size: Joi.string().allow('', null).optional(),
            _id: Joi.any().optional()
        }).unknown(false)
    ).required(),
    total: Joi.number().min(0).required(),
    status: Joi.string()
        .valid('Нове замовлення', 'В обробці', 'Відправлено', 'Доставлено', 'Скасовано')
        .default('Нове замовлення')
});

module.exports = { Order: mongoose.model('Order', orderSchema), orderSchemaValidation };