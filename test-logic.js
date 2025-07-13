// Тестуємо логіку обробки даних категорій

const testData = {
    categories: [
        { _id: "686508cfb07e9787a8396fca", order: 1 },
        { _id: "68663916591d3aaa3a863c90", order: 3 }
    ]
};

console.log("=== ТЕСТ ЛОГІКИ ===");
console.log("Початкові дані:", testData);
console.log("testData.categories:", testData.categories);
console.log("Тип testData.categories:", typeof testData.categories);
console.log("Array.isArray(testData.categories):", Array.isArray(testData.categories));

let { categories: categoryUpdates } = testData;
console.log("categoryUpdates:", categoryUpdates);
console.log("Тип categoryUpdates:", typeof categoryUpdates);
console.log("Array.isArray(categoryUpdates):", Array.isArray(categoryUpdates));

// Симулюємо ситуацію, коли categories є об'єктом
const testDataAsObject = {
    categories: {
        0: { _id: "686508cfb07e9787a8396fca", order: 1 },
        1: { _id: "68663916591d3aaa3a863c90", order: 3 }
    }
};

console.log("\n=== ТЕСТ З ОБ'ЄКТОМ ===");
console.log("testDataAsObject.categories:", testDataAsObject.categories);
console.log("Тип testDataAsObject.categories:", typeof testDataAsObject.categories);
console.log("Array.isArray(testDataAsObject.categories):", Array.isArray(testDataAsObject.categories));

let { categories: categoryUpdates2 } = testDataAsObject;
console.log("categoryUpdates2:", categoryUpdates2);
console.log("Тип categoryUpdates2:", typeof categoryUpdates2);
console.log("Array.isArray(categoryUpdates2):", Array.isArray(categoryUpdates2));

if (!Array.isArray(categoryUpdates2)) {
    if (categoryUpdates2 && typeof categoryUpdates2 === 'object') {
        const keys = Object.keys(categoryUpdates2);
        const hasNumericKeys = keys.every(key => !isNaN(parseInt(key)));
        
        console.log("Ключі об'єкта:", keys);
        console.log("Чи всі ключі числові:", hasNumericKeys);
        
        if (hasNumericKeys) {
            categoryUpdates2 = Object.values(categoryUpdates2);
            console.log("Після Object.values:", categoryUpdates2);
        }
    }
}

console.log("\n=== РЕЗУЛЬТАТ ===");
console.log("Фінальний categoryUpdates2:", categoryUpdates2);
console.log("Довжина:", categoryUpdates2.length);

for (let i = 0; i < categoryUpdates2.length; i++) {
    const update = categoryUpdates2[i];
    console.log(`Елемент ${i}:`, update);
    console.log(`  _id: ${update._id}`);
    console.log(`  order: ${update.order}`);
} 