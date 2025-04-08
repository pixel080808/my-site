// models/Slide.js
const mongoose = require('mongoose');
const slideSchema = new mongoose.Schema({
    name: String,
    url: String,
    title: String,
    text: String,
    link: String,
    linkText: String
}, { timestamps: true });
module.exports = mongoose.model('Slide', slideSchema);