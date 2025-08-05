const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
    try {
        console.log('Testing database connection...');
        console.log('MONGO_URI:', process.env.MONGO_URI ? 'Set' : 'Not set');
        
        if (!process.env.MONGO_URI) {
            console.error('MONGO_URI is not set in environment variables');
            process.exit(1);
        }

        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Database connection successful!');
        
        // Test basic operations
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Available collections:', collections.map(c => c.name));
        
        await mongoose.connection.close();
        console.log('✅ Database test completed successfully!');
        
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

testConnection(); 