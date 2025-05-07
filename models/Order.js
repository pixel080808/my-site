const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    cartId: {
        type: String,
        default: '',
        validate: {
            validator: function(v) {
                return v === '' || /^cart-[a-zA-Z0-9]{9}$/.test(v);
            },
            message: 'cartId must be in format cart-xxxxxxxxx (9 alphanumeric characters) or empty string'
        }
    },
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
            address: { type: String, default: '' },
            payment: { type: String, default: '' }
        },
        required: true
    },
    items: [{
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
    }],
    total: { 
        type: Number, 
        required: true, 
        min: 0
    },
    status: { 
        type: String, 
        default: 'Нове замовлення',
        enum: ['Нове замовлення', 'В обробці', 'Відправлено', 'Доставлено', 'Скасовано']
    }
}, { timestamps: true });

orderSchema.index({ date: -1 });

module.exports = mongoose.model('Order', orderSchema);