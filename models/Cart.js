const Joi = require('joi');
const mongoose = require('mongoose');

// Схема MongoDB для Cart
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
                name: { type: String },
                value: { type: String },
                priceChange: { type: Number, default: 0 },
                photo: { // Додано поле photo
                    type: String,
                    default: '',
                    validate: {
                        validator: function(v) {
                            return v === '' || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
                        },
                        message: 'Color photo must be a valid URL or empty string'
                    }
                }
            }
        }
    ],
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Оновлення updatedAt перед збереженням
cartSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Індекс для updatedAt
cartSchema.index({ updatedAt: 1 });

const Cart = mongoose.model('Cart', cartSchema);

// Joi-валідація для масиву items
const cartSchemaValidation = Joi.array().items(
    Joi.object({
        id: Joi.number().required(),
        name: Joi.string().required(),
        quantity: Joi.number().min(1).required(),
        price: Joi.number().min(0).required(),
        photo: Joi.string().uri().allow('').optional(),
        color: Joi.object({
            name: Joi.string().required(),
            value: Joi.string().required(),
            priceChange: Joi.number().default(0),
            photo: Joi.string().uri().allow('', null).optional()
        }).optional()
    })
);

module.exports = { Cart, cartSchemaValidation };