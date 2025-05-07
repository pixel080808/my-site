const Joi = require('joi');
const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    cartId: { type: String, required: true, unique: true },
    items: [
        {
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
                        default: '',
                        validate: {
                            validator: function(v) {
                                return v === '' || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
                            },
                            message: 'Color photo must be a valid URL or empty string'
                        }
                    },
                    size: { type: String, default: null } // Added size field
                },
                default: null
            }
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
        id: Joi.number().required(),
        name: Joi.string().required(),
        quantity: Joi.number().min(1).required(),
        price: Joi.number().min(0).required(),
        photo: Joi.string().uri().allow('').optional(),
        color: Joi.object({
            name: Joi.string().allow('').optional(),
            value: Joi.string().allow('').optional(),
            priceChange: Joi.number().default(0),
            photo: Joi.string().uri().allow('', null).optional(),
            size: Joi.string().allow('', null).optional() // Added size field
        }).allow(null).optional()
    })
);

module.exports = { Cart, cartSchemaValidation };