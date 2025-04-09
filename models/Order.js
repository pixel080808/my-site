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
module.exports = mongoose.model('Order', orderSchema);