const mongoose = require('mongoose');
const orderSchema = new mongoose.Schema({
    id: Number,
    date: { type: Date, default: Date.now },
    customer: Object,
    items: [{
        id: Number,
        name: String, // Додаємо поле name
        quantity: Number,
        price: Number,
        color: String
    }],
    total: Number,
    status: String
}, { timestamps: true });

// Додаємо індекси
orderSchema.index({ id: 1 }, { unique: true });
orderSchema.index({ date: -1 });

module.exports = mongoose.model('Order', orderSchema);