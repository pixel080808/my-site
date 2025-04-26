const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
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
            address: { type: String, default: '' }
        },
        required: true
    },
    items: [{
        id: { type: Number, required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
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
    }],
    total: Number,
    status: String
}, { timestamps: true });

orderSchema.index({ date: -1 });

module.exports = mongoose.model('Order', orderSchema);