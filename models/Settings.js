const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    baseUrl: {
        type: String,
        default: '',
        validate: {
            validator: function(v) {
                return v === '' || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
            },
            message: 'Base URL must be a valid URL or empty string'
        }
    },
    logo: {
        type: String,
        default: '',
        validate: {
            validator: function(v) {
                return v === '' || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
            },
            message: 'Logo must be a valid URL or empty string'
        }
    },
    logoWidth: { type: Number, default: 150 },
    favicon: {
        type: String,
        default: '',
        validate: {
            validator: function(v) {
                return v === '' || /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
            },
            message: 'Favicon must be a valid URL or empty string'
        }
    },
    contacts: {
        phones: { type: String, default: '' },
        addresses: { type: String, default: '' },
        schedule: { type: String, default: '' }
    },
    socials: [{
        name: { type: String, default: '' },
        url: {
            type: String,
            required: true,
            validate: {
                validator: function(v) {
                    return /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
                },
                message: 'Social URL must be a valid URL'
            }
        },
        icon: { type: String, default: '' }
    }],
    showSocials: { type: Boolean, default: true },
    about: { type: String, default: '' },
    categoryWidth: { type: Number, default: 0 },
    categoryHeight: { type: Number, default: 0 },
    productWidth: { type: Number, default: 0 },
    productHeight: { type: Number, default: 0 },
    filters: [{
        name: { type: String, required: true },
        label: { type: String, required: true },
        type: { type: String, required: true },
        options: [{ type: String, minLength: 1 }]
    }],
    orderFields: [{
        name: { type: String, required: true },
        label: { type: String, required: true },
        type: { type: String, required: true },
        options: [{ type: String, minLength: 1 }]
    }],
    slideWidth: { type: Number, default: 0 },
    slideHeight: { type: Number, default: 0 },
    slideInterval: { type: Number, default: 3000 },
    showSlides: { type: Boolean, default: true },
    metaTitle: { type: String, default: '', trim: true },
    metaDescription: { type: String, default: '', trim: true },
    metaKeywords: { type: String, default: '', trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);