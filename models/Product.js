const mongoose = require('mongoose');
const Counter = require('./counter');

const productSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    subcategory: { type: String },
    price: { type: Number },
    salePrice: { type: Number },
    saleEnd: { type: Date },
    brand: { type: String },
    material: { type: String },
    photos: [String],
    visible: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    slug: { type: String, unique: true },
    type: { type: String, enum: ['simple', 'mattresses', 'group'] },
    sizes: [{ name: String, price: Number }],
    colors: [{ name: String, value: String, photo: String, priceChange: Number }],
    groupProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    description: String,
    widthCm: Number,
    depthCm: Number,
    heightCm: Number,
    lengthCm: Number,
    popularity: Number
}, { timestamps: true });

productSchema.pre('save', async function(next) {
    if (this.isNew) {
        const counter = await Counter.findByIdAndUpdate(
            { _id: 'productId' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.id = counter.seq;
    }
    next();
});

module.exports = mongoose.model('Product', productSchema);