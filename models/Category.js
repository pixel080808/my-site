// models/Category.js
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    slug: { type: String, unique: true, required: true },
    image: String,
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    subcategories: [{
        name: { type: String, required: true },
        slug: { type: String, required: true },
        image: { type: String, default: '' }
    }]
}, { timestamps: true });
module.exports = mongoose.model('Category', categorySchema);