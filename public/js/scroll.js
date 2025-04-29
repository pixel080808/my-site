// public/js/scroll.js

// Функція для плавної прокрутки до елемента
function scrollToElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Обробка подій прокрутки для відображення/приховування кнопки "вгору"
function handleScroll() {
    const scrollTopButton = document.getElementById('scroll-top');
    if (scrollTopButton) {
        if (window.scrollY > 300) {
            scrollTopButton.style.display = 'block';
        } else {
            scrollTopButton.style.display = 'none';
        }
    }
}

// Використовуємо MutationObserver замість застарілого DOMNodeInserted
function observeDOMChanges(targetSelector, callback) {
    const target = document.querySelector(targetSelector);
    if (!target) {
        console.warn(`Елемент ${targetSelector} не знайдено для спостереження`);
        return;
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length || mutation.removedNodes.length) {
                callback(mutation);
            }
        });
    });

    observer.observe(target, {
        childList: true,
        subtree: true,
    });

    return observer;
}

// Ініціалізація
document.addEventListener('DOMContentLoaded', () => {
    // Додаємо обробник подій прокрутки
    window.addEventListener('scroll', handleScroll);

    // Додаємо обробник для кнопки "вгору"
    const scrollTopButton = document.getElementById('scroll-top');
    if (scrollTopButton) {
        scrollTopButton.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Спостерігаємо за змінами в DOM (наприклад, у списку товарів)
    observeDOMChanges('#product-list-admin', (mutation) => {
        console.log('Зміни в списку товарів:', mutation);
        handleScroll(); // Оновлюємо видимість кнопки "вгору" при змінах
    });
});