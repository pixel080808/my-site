// models/Slide.js
const mongoose = require('mongoose');
const slideSchema = new mongoose.Schema({
    name: String,
    url: String,
    title: String,
    text: String,
    link: String,
    linkText: String
    order: { type: Number, default: 0 } // Додано
}, { timestamps: true });
module.exports = mongoose.model('Slide', slideSchema);