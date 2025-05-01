const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true }
}, { timestamps: true });

// Перевірка унікальності name
brandSchema.pre('save', async function(next) {
    const brand = this;
    if (brand.isModified('name')) {
        const existing = await mongoose.models.Brand.findOne({ name: brand.name, _id: { $ne: brand._id } });
        if (existing) {
            throw new Error('Бренд з такою назвою вже існує');
        }
    }
    next();
});

module.exports = mongoose.model('Brand', brandSchema);