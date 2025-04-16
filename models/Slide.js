// models/Slide.js
const mongoose = require('mongoose');

const slideSchema = new mongoose.Schema({
    id: Number,
    image: String, // Змінено з img
    name: String,
    url: String,
    title: String,
    text: String,
    link: String,
    linkText: String,
    order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Slide', slideSchema);