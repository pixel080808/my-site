const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // Ідентифікатор користувача (з JWT)
    items: [
        {
            id: { type: Number, required: true }, // ID продукту
            name: { type: String, required: true },
            quantity: { type: Number, required: true },
            price: { type: Number, required: true },
            color: { type: String, default: '' }
        }
    ],
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cart', cartSchema);