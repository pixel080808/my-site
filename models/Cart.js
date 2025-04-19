const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    cartId: { type: String, required: true, unique: true },
    items: [
        {
            id: { type: Number, required: true },
            name: { type: String, required: true },
            quantity: { type: Number, required: true },
            price: { type: Number, required: true },
            color: { type: String, default: '' },
            photo: {
                type: String,
                default: '',
                validate: {
                    validator: function(v) {
                        return v === '' || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
                    },
                    message: 'Photo must be a valid URL or empty string'
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

// Індекс для updatedAt (залишаємо, оскільки він потрібен для сортування)
cartSchema.index({ updatedAt: 1 });

module.exports = mongoose.model('Cart', cartSchema);