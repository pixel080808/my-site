const settingsSchema = new mongoose.Schema({
    name: String,
    baseUrl: String, // Додано
    logo: String,
    logoWidth: Number,
    favicon: String,
    contacts: {
        phones: String,
        addresses: String,
        schedule: String
    },
    socials: [{ name: String, url: String, icon: String }],
    showSocials: { type: Boolean, default: true },
    about: String,
    categoryWidth: Number, // Додано
    categoryHeight: Number, // Додано
    productWidth: Number, // Додано
    productHeight: Number, // Додано
    filters: [{ // Додано
        name: String,
        label: String,
        type: String,
        options: [String]
    }],
    orderFields: [{ // Додано
        name: String,
        label: String,
        type: String,
        options: [String]
    }],
    slideWidth: Number, // Додано
    slideHeight: Number, // Додано
    slideInterval: { type: Number, default: 3000 },
    showSlides: { type: Boolean, default: true }
}, { timestamps: true });