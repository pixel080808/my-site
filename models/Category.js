const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    subcategories: [{
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, trim: true },
        order: { type: Number, required: true, default: 0 }
    }],
    order: {
        type: Number,
        required: true,
        default: 0
    }
});

// Перевірка унікальності slug
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

// Нормалізація порядку перед збереженням
categorySchema.pre('save', async function(next) {
    const category = this;
    if (category.isModified('order')) {
        const existing = await mongoose.models.Category.findOne({ order: category.order, _id: { $ne: category._id } });
        if (existing) {
            // Знаходимо максимальний order і додаємо +1
            const maxOrder = await mongoose.models.Category.aggregate([
                { $group: { _id: null, maxOrder: { $max: '$order' } } }
            ]);
            category.order = (maxOrder[0]?.maxOrder || 0) + 1;
        }
    }
    // Нормалізація порядку підкатегорій
    if (category.subcategories && category.isModified('subcategories')) {
        const seenOrders = new Set();
        for (let i = 0; i < category.subcategories.length; i++) {
            const sub = category.subcategories[i];
            if (seenOrders.has(sub.order)) {
                // Знаходимо унікальний order
                let newOrder = Math.max(...seenOrders, 0) + 1;
                sub.order = newOrder;
            }
            seenOrders.add(sub.order);
        }
    }
    next();
});

module.exports = mongoose.model('Category', categorySchema);