require('dotenv').config();

console.log('🔍 Checking environment variables...\n');

const requiredVars = [
    'MONGO_URI',
    'JWT_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
];

const optionalVars = [
    'NODE_ENV',
    'PORT'
];

let allGood = true;

console.log('📋 Required variables:');
requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`✅ ${varName}: Set`);
    } else {
        console.log(`❌ ${varName}: Not set`);
        allGood = false;
    }
});

console.log('\n📋 Optional variables:');
optionalVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`✅ ${varName}: ${value}`);
    } else {
        console.log(`⚠️  ${varName}: Not set (using default)`);
    }
});

console.log('\n📋 Current configuration:');
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`PORT: ${process.env.PORT || 3000}`);

if (allGood) {
    console.log('\n🎉 All required environment variables are set!');
    console.log('You can now run: npm start');
} else {
    console.log('\n❌ Some required environment variables are missing!');
    console.log('Please set them in your .env file or environment.');
    process.exit(1);
} 