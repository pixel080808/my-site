// models/Settings.js
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    name: String,
    baseUrl: String,
    logo: String,
    logoWidth: Number,
    favicon: String,
    contacts: {
        phones: String,
        addresses: String,
        schedule: String
    },
    socials: [{ name: String, url: String, icon: String }],
    showSocials: { type: Boolean, default: true },
    about: String,
    categoryWidth: Number,
    categoryHeight: Number,
    productWidth: Number,
    productHeight: Number,
    filters: [{
        name: String,
        label: String,
        type: String,
        options: [String]
    }],
    orderFields: [{
        name: String,
        label: String,
        type: String,
        options: [String]
    }],
    slideWidth: Number,
    slideHeight: Number,
    slideInterval: { type: Number, default: 3000 },
    showSlides: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema); // Додано