const Joi = require('joi');
const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    cartId: {
        type: String,
        required: true,
        unique: true,
        match: /^cart-[a-z0-9]{9}$/,
        validate: {
            validator: function(v) {
                return /^cart-[a-z0-9]{9}$/.test(v);
            },
            message: 'cartId must be in format cart-xxxxxxxxx (9 alphanumeric characters)'
        }
    },
    items: [
        {
            id: { type: mongoose.Schema.Types.Mixed, required: true },
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
            // Підтримка масиву кольорів (нова структура)
            colors: {
                type: [{
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
                    },
                    blockIndex: { type: Number, default: 0 }
                }],
                default: []
            },
            // Підтримка одного кольору (стара структура для зворотної сумісності)
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
        }
    ],
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

cartSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

cartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Cart = mongoose.model('Cart', cartSchema);

const cartSchemaValidation = Joi.array().items(
    Joi.object({
        id: Joi.alternatives().try(Joi.number(), Joi.string()).required(),
        name: Joi.string().required(),
        quantity: Joi.number().min(1).required(),
        price: Joi.number().min(0).required(),
        photo: Joi.string().uri().allow('').optional(),
        // Валідація для масиву кольорів
        colors: Joi.array().items(
            Joi.object({
                name: Joi.string().allow('').optional(),
                value: Joi.string().allow('').optional(),
                priceChange: Joi.number().default(0),
                photo: Joi.string().uri().allow('', null).optional(),
                blockIndex: Joi.number().default(0)
            })
        ).allow(null).optional(),
        // Валідація для одного кольору (зворотна сумісність)
        color: Joi.alternatives().try(
            Joi.object({
                name: Joi.string().allow('').optional(),
                value: Joi.string().allow('').optional(),
                priceChange: Joi.number().default(0),
                photo: Joi.string().uri().allow('', null).optional()
            }),
            Joi.array().items(
                Joi.object({
                    name: Joi.string().allow('').optional(),
                    value: Joi.string().allow('').optional(),
                    priceChange: Joi.number().default(0),
                    photo: Joi.string().uri().allow('', null).optional(),
                    blockIndex: Joi.number().default(0)
                })
            )
        ).allow(null).optional(),
        size: Joi.string().allow('', null).optional()
    }).unknown(false)
);

module.exports = { Cart, cartSchemaValidation };