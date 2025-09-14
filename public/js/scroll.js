
function scrollToElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        console.warn(`Елемент з ID ${elementId} не знайдено`);
    }
}

function handleScroll() {
    const scrollTopButton = document.getElementById('scroll-top');
    if (scrollTopButton) {
        scrollTopButton.style.display = window.scrollY > 300 ? 'block' : 'none';
    }
}

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

document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('scroll', handleScroll);

    const scrollTopButton = document.getElementById('scroll-top');
    if (scrollTopButton) {
        scrollTopButton.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    const disconnectObserver = observeDOMChanges('#product-list-admin', (mutation) => {
        console.log('Зміни в списку товарів:', mutation);
        handleScroll(); // Оновлюємо видимість кнопки "вгору" при змінах
    });
});