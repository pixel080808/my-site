const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    date: { type: Date, default: Date.now },
    customer: Object,
    items: [{
        id: { type: Number, required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        color: {
            type: String,
            default: '',
            validate: {
                validator: function(v) {
                    return v === '' || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
                },
                message: 'Color must be a valid URL or empty string'
            }
        }
    }],
    total: Number,
    status: String
}, { timestamps: true });

// Індекси
orderSchema.index({ date: -1 });

module.exports = mongoose.model('Order', orderSchema);