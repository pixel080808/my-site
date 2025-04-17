const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    cartId: { type: String, required: true },
    items: [
        {
            id: { type: Number, required: true },
            name: { type: String, required: true },
            quantity: { type: Number, required: true },
            price: { type: Number, required: true },
            color: { type: String, default: '' },
            photo: { type: String, default: '' } // Додаємо поле photo
        }
    ],
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cart', cartSchema);