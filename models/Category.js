const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: String,
    slug: String,
    photo: String,
    visible: { type: Boolean, default: true },
    subcategories: [{
        name: String,
        slug: String,
        photo: String,
        order: Number,
        visible: { type: Boolean, default: true }
    }],
    order: Number
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);