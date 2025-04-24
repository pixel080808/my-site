const mongoose = require('mongoose');

const subcategorySchema = new mongoose.Schema({
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
    photo: { 
        type: String, 
        default: '' 
    },
    visible: { 
        type: Boolean, 
        default: true 
    },
    order: { 
        type: Number, 
        default: 0, 
        min: 0 
    }
});

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
    photo: { 
        type: String, 
        default: '' 
    },
    visible: { 
        type: Boolean, 
        default: true 
    },
    subcategories: [subcategorySchema],
    order: {
        type: Number,
        default: 0,
        min: 0
    }
}, { timestamps: true });

// Перевірка унікальності slug категорії
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

// Перевірка унікальності slug підкатегорій
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

// Нормалізація порядку підкатегорій перед збереженням
categorySchema.pre('save', function(next) {
    const category = this;
    if (category.isModified('subcategories') && category.subcategories) {
        category.subcategories.forEach((sub, idx) => {
            sub.order = idx; // Переконуємося, що order відповідає індексу
        });
    }
    next();
});

module.exports = mongoose.model('Category', categorySchema);