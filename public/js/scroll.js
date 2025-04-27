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

// Функція для спостереження за змінами в DOM із можливістю повторного пошуку елемента
function observeDOMChanges(targetSelector, callback) {
    let observer = null;
    let currentTarget = document.querySelector(targetSelector);

    // Функція для ініціалізації спостерігача
    const initObserver = (target) => {
        if (!target) {
            console.warn(`Елемент ${targetSelector} не знайдено для спостереження`);
            return null;
        }

        observer = new MutationObserver((mutations) => {
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
    };

    // Ініціалізація спостерігача, якщо елемент існує
    if (currentTarget) {
        observer = initObserver(currentTarget);
    }

    // Спостерігаємо за змінами в DOM, щоб повторно знайти елемент, якщо він з’явиться
    const rootObserver = new MutationObserver(() => {
        const newTarget = document.querySelector(targetSelector);
        if (newTarget && newTarget !== currentTarget) {
            if (observer) {
                observer.disconnect();
            }
            currentTarget = newTarget;
            observer = initObserver(currentTarget);
        }
    });

    rootObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });

    // Функція для відключення спостерігачів
    const disconnect = () => {
        if (observer) {
            observer.disconnect();
        }
        rootObserver.disconnect();
    };

    return disconnect;
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
    let disconnectObserver = null;
    const startObserving = () => {
        if (disconnectObserver) {
            disconnectObserver();
        }
        disconnectObserver = observeDOMChanges('#product-list-admin', (mutation) => {
            console.log('Зміни в списку товарів:', mutation);
            handleScroll(); // Оновлюємо видимість кнопки "вгору" при змінах
            // Додайте тут додаткову логіку, якщо потрібно обробляти зміни в списку товарів
            // Наприклад, оновлення стилів, підрахунок елементів тощо
        });
    };

    startObserving();

    // Додаємо обробник для повторного запуску спостерігача при зміні секції
    // Це корисно, якщо ваш `#product-list-admin` видаляється/додається при перемиканні вкладок
    document.addEventListener('sectionChanged', (event) => {
        if (event.detail === 'products') {
            startObserving();
        }
    });
});

// Відключення спостерігачів при закритті сторінки
window.addEventListener('beforeunload', () => {
    if (typeof disconnectObserver === 'function') {
        disconnectObserver();
    }
});