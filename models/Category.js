const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 255
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        maxlength: 255
    },
    photo: { type: String, default: '' },
    visible: { type: Boolean, default: true },
    subcategories: [{
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },
        slug: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },
        photo: { type: String, default: '' },
        order: { type: Number, required: true, default: 0 },
        visible: { type: Boolean, default: true }
    }],
    order: {
        type: Number,
        required: true,
        default: 0
    }
}, { timestamps: true });

categorySchema.pre('save', async function(next) {
    const category = this;
    if (category.isModified('slug')) {
        const existing = await mongoose.models.Category.findOne({ slug: category.slug, _id: { $ne: category._id } });
        if (existing) {
            throw new Error('Цей slug вже використовується іншою категорією');
        }
    }
    next();
});

categorySchema.pre('save', async function(next) {
    const category = this;
    if (category.isModified('subcategories')) {
        const slugs = new Set();
        for (const sub of category.subcategories) {
            if (slugs.has(sub.slug)) {
                throw new Error(`Підкатегорія з slug "${sub.slug}" уже існує в цій категорії`);
            }
            slugs.add(sub.slug);
        }
    }
    next();
});

categorySchema.pre('save', async function(next) {
    const category = this;
    if (category.isModified('order')) {
        const existing = await mongoose.models.Category.findOne({ order: category.order, _id: { $ne: category._id } });
        if (existing) {
            const maxOrder = await mongoose.models.Category.aggregate([
                { $group: { _id: null, maxOrder: { $max: '$order' } } }
            ]);
            category.order = (maxOrder[0]?.maxOrder || 0) + 1;
        }
    }
    if (category.subcategories && category.isModified('subcategories')) {
        const seenOrders = new Set();
        for (let i = 0; i < category.subcategories.length; i++) {
            const sub = category.subcategories[i];
            if (seenOrders.has(sub.order)) {
                let newOrder = Math.max(...seenOrders, 0) + 1;
                sub.order = newOrder;
            }
            seenOrders.add(sub.order);
        }
    }
    next();
});

module.exports = mongoose.model('Category', categorySchema);