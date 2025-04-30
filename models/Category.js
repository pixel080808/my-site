const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        maxlength: 255 // Kept maxlength for safety
    },
    slug: {
        type: String,
        unique: true, // Kept unique, but can remove if duplicates are okay
        trim: true,
        maxlength: 255
    },
    photo: { type: String, default: '' },
    visible: { type: Boolean, default: true },
    subcategories: [{
        name: {
            type: String,
            trim: true,
            maxlength: 255
        },
        slug: {
            type: String,
            trim: true,
            maxlength: 255
        },
        photo: { type: String, default: '' },
        order: { type: Number, default: 0 },
        visible: { type: Boolean, default: true }
    }],
    order: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// Remove all pre-save hooks to disable validations
// categorySchema.pre('save', async function(next) { ... }); // Removed slug uniqueness check
// categorySchema.pre('save', async function(next) { ... }); // Removed subcategory slug uniqueness check
// categorySchema.pre('save', async function(next) { ... }); // Removed order normalization

module.exports = mongoose.model('Category', categorySchema);