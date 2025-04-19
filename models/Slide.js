const mongoose = require('mongoose');

const slideSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
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
    name: { type: String, default: '' },
    url: {
        type: String,
        default: '',
        validate: {
            validator: function(v) {
                return v === '' || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
            },
            message: 'URL must be a valid URL or empty string'
        }
    },
    title: { type: String, default: '' },
    text: { type: String, default: '' },
    link: {
        type: String,
        default: '',
        validate: {
            validator: function(v) {
                return v === '' || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
            },
            message: 'Link must be a valid URL or empty string'
        }
    },
    linkText: { type: String, default: '' },
    order: { type: Number, default: 0 }
}, { timestamps: true });

// Індекси
slideSchema.index({ order: 1 });

module.exports = mongoose.model('Slide', slideSchema);