// models/Settings.js
const mongoose = require('mongoose');
const settingsSchema = new mongoose.Schema({
    name: String,
    logo: String,
    logoWidth: Number,
    contacts: {
        phones: String,
        addresses: String,
        schedule: String
    },
    socials: [{ name: String, url: String, icon: String }],
    showSocials: { type: Boolean, default: true },
    about: String,
    showSlides: { type: Boolean, default: true },
    slideInterval: { type: Number, default: 3000 },
    favicon: String
}, { timestamps: true });
module.exports = mongoose.model('Settings', settingsSchema);