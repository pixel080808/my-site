<<<<<<< HEAD

=======
// public/js/scroll.js

// Функція для плавної прокрутки до елемента
>>>>>>> 451743e (Оновлення)
function scrollToElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        console.warn(`Елемент з ID ${elementId} не знайдено`);
    }
}

<<<<<<< HEAD
=======
// Обробка подій прокрутки для відображення/приховування кнопки "вгору"
>>>>>>> 451743e (Оновлення)
function handleScroll() {
    const scrollTopButton = document.getElementById('scroll-top');
    if (scrollTopButton) {
        scrollTopButton.style.display = window.scrollY > 300 ? 'block' : 'none';
    }
}

<<<<<<< HEAD
=======
// Спостереження за змінами в DOM із можливістю відключення
>>>>>>> 451743e (Оновлення)
function observeDOMChanges(targetSelector, callback) {
    const target = document.querySelector(targetSelector);
    if (!target) {
        console.warn(`Елемент ${targetSelector} не знайдено для спостереження`);
        return null;
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

    return () => {
        observer.disconnect();
        console.log(`Спостерігач для ${targetSelector} відключено`);
    };
}

<<<<<<< HEAD
document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('scroll', handleScroll);

=======
// Ініціалізація
document.addEventListener('DOMContentLoaded', () => {
    // Додаємо обробник подій прокрутки
    window.addEventListener('scroll', handleScroll);

    // Додаємо обробник для кнопки "вгору"
>>>>>>> 451743e (Оновлення)
    const scrollTopButton = document.getElementById('scroll-top');
    if (scrollTopButton) {
        scrollTopButton.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

<<<<<<< HEAD
=======
    // Спостерігаємо за змінами в DOM (наприклад, у списку товарів)
>>>>>>> 451743e (Оновлення)
    const disconnectObserver = observeDOMChanges('#product-list-admin', (mutation) => {
        console.log('Зміни в списку товарів:', mutation);
        handleScroll(); // Оновлюємо видимість кнопки "вгору" при змінах
    });
<<<<<<< HEAD
=======

    // Приклад: відключення спостерігача при зміні секції (опціонально)
    // document.addEventListener('sectionChanged', () => {
    //     if (disconnectObserver) disconnectObserver();
    // });
>>>>>>> 451743e (Оновлення)
});