const mongoose = require('mongoose');
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 255 },
    slug: { type: String, required: true, maxlength: 255, unique: true },
    photo: { type: String, default: '' },
    visible: { type: Boolean, default: true }, // Додаємо visible для категорії
    subcategories: [{
        name: { type: String, required: true, maxlength: 255 },
        slug: { type: String, required: true, maxlength: 255 },
        photo: { type: String, default: '' },
        visible: { type: Boolean, default: true } // Додаємо visible для підкатегорії
    }]
}, { timestamps: true });
module.exports = mongoose.model('Category', categorySchema);