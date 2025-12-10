// Основной класс для управления 3D сценой с поддержкой тачскрина
class ModelViewer {
    constructor() {
        // Основные переменные Three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = null;
        this.mouse = new THREE.Vector2();
        
        // Текущая модель и объекты
        this.currentModel = null;
        this.currentModelName = 'cube';
        this.selectedObject = null;
        this.objects = [];
        
        // Настройки
        this.autoRotate = false; // По умолчанию выключено на мобильных
        this.showGrid = true;
        this.showAxes = false; // По умолчанию выключено на мобильных
        this.grid = null;
        this.axes = null;
        
        // Вспомогательные объекты
        this.highlightBox = null;
        
        // Определяем тип устройства
        this.isMobile = this.checkMobileDevice();
        
        // Состояния касания
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.lastTouchTime = 0;
        this.touchTimeout = null;
        
        // Cart
        this.cartItems = [];
        
        // Статистика
        this.stats = {
            fps: 0,
            lastTime: 0,
            frameCount: 0,
            polygonCount: 0
        };
        
        this.init();
    }
    
    // Проверяем, мобильное ли устройство
    checkMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               window.innerWidth <= 768;
    }
    
    init() {
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupControls();
        this.setupLights();
        this.setupHelpers();
        this.setupEventListeners();
        this.setupUIListeners();
        this.setupDeviceSpecificSettings();
        
        // Загружаем модель по умолчанию
        this.loadModel('cube');
        
        // Запускаем анимацию
        this.animate();
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        if (!this.isMobile) {
            this.scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);
        }
    }
    
    setupCamera() {
        const canvas = document.getElementById('three-canvas');
        this.camera = new THREE.PerspectiveCamera(
            45,
            canvas.clientWidth / canvas.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);
    }
    
    setupRenderer() {
        const canvas = document.getElementById('three-canvas');
        
        // Оптимизации для мобильных устройств
        const rendererOptions = {
            canvas: canvas,
            antialias: !this.isMobile, // Отключаем сглаживание на мобильных для производительности
            alpha: true,
            powerPreference: 'high-performance'
        };
        
        this.renderer = new THREE.WebGLRenderer(rendererOptions);
        
        // Устанавливаем размер с учетом pixel ratio
        const pixelRatio = this.isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio;
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        
        // Настройки теней только для десктопов
        if (!this.isMobile) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        
        this.renderer.outputEncoding = THREE.sRGBEncoding;
    }
    
    setupControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 50;
        this.controls.maxPolarAngle = Math.PI;
        
        // Оптимизации для мобильных
        if (this.isMobile) {
            this.controls.enablePan = true;
            this.controls.enableZoom = true;
            this.controls.enableRotate = true;
            this.controls.touches = {
                ONE: THREE.TOUCH.ROTATE,
                TWO: THREE.TOUCH.DOLLY_PAN
            };
        }
    }
    
    setupLights() {
        // Основной направленный свет
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7);
        if (!this.isMobile) {
            directionalLight.castShadow = true;
        }
        this.scene.add(directionalLight);
        
        // Заполняющий свет
        const ambientLight = new THREE.AmbientLight(0x404040, this.isMobile ? 0.7 : 0.5);
        this.scene.add(ambientLight);
        
        // Подсветка сзади (только для десктопов)
        if (!this.isMobile) {
            const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
            backLight.position.set(-5, 5, -5);
            this.scene.add(backLight);
        }
    }
    
    setupHelpers() {
        // Сетка
        this.grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
        this.grid.position.y = -0.01;
        this.grid.visible = this.showGrid;
        this.scene.add(this.grid);
        
        // Оси координат
        this.axes = new THREE.AxesHelper(5);
        this.axes.visible = this.showAxes;
        this.scene.add(this.axes);
        
        // Raycaster для кликов
        this.raycaster = new THREE.Raycaster();
        
        // BoxHelper для выделения
        this.highlightBox = new THREE.BoxHelper(new THREE.Mesh(), 0x3498db);
        this.highlightBox.visible = false;
        this.scene.add(this.highlightBox);
    }
    
    // КРИТИЧЕСКИ ВАЖНЫЙ МЕТОД: Настройка обработчиков событий для тачскрина
    setupEventListeners() {
        const canvas = this.renderer.domElement;
        
        // Универсальная функция для получения координат из любого события
        const getNormalizedCoordinates = (event) => {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            
            // Обработка касаний
            if (event.type.includes('touch')) {
                if (event.touches.length > 0) {
                    clientX = event.touches[0].clientX;
                    clientY = event.touches[0].clientY;
                } else if (event.changedTouches.length > 0) {
                    // Для события touchend
                    clientX = event.changedTouches[0].clientX;
                    clientY = event.changedTouches[0].clientY;
                } else {
                    return null;
                }
            } 
            // Обработка событий мыши
            else {
                clientX = event.clientX;
                clientY = event.clientY;
            }
            
            // Преобразуем в нормализованные координаты Three.js
            return {
                x: ((clientX - rect.left) / rect.width) * 2 - 1,
                y: -((clientY - rect.top) / rect.height) * 2 + 1
            };
        };
        
        // Обработчик выбора объекта
        const handleSelection = (event) => {
            // Предотвращаем стандартное поведение браузера
            if (event.cancelable) {
                event.preventDefault();
            }
            
            // Получаем координаты
            const coords = getNormalizedCoordinates(event);
            if (!coords) return;
            
            this.mouse.set(coords.x, coords.y);
            
            // Используем Raycaster для определения пересечений
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.objects);
            
            if (intersects.length > 0) {
                const object = intersects[0].object;
                this.selectObject(object);
                
                // Вибрация на мобильных (если поддерживается)
                if (this.isMobile && navigator.vibrate) {
                    navigator.vibrate(50);
                }
            } else {
                this.hidePopup();
                this.clearSelection();
            }
        };
        
        // Обработчик для предотвращения случайных касаний (задержка)
        const handleTouchStart = (event) => {
            if (event.touches.length === 1) {
                this.touchStartX = event.touches[0].clientX;
                this.touchStartY = event.touches[0].clientY;
                
                // Устанавливаем таймаут для обработки долгого касания
                this.touchTimeout = setTimeout(() => {
                    // Долгое касание - показываем контекстное меню
                    this.showContextMenu(event);
                }, 500);
            }
        };
        
        const handleTouchEnd = (event) => {
            // Очищаем таймаут
            if (this.touchTimeout) {
                clearTimeout(this.touchTimeout);
                this.touchTimeout = null;
            }
            
            // Проверяем, было ли это короткое касание (тап)
            if (event.changedTouches.length === 1) {
                const touch = event.changedTouches[0];
                const deltaX = Math.abs(touch.clientX - this.touchStartX);
                const deltaY = Math.abs(touch.clientY - this.touchStartY);
                
                // Если перемещение меньше 10px - считаем это тапом
                if (deltaX < 10 && deltaY < 10) {
                    handleSelection(event);
                }
            }
            
            // Проверка на двойное касание (сброс камеры)
            const currentTime = Date.now();
            if (currentTime - this.lastTouchTime < 300) { // 300ms между касаниями
                this.resetCamera();
                if (event.cancelable) event.preventDefault();
            }
            this.lastTouchTime = currentTime;
        };
        
        // ПОДПИСКА НА СОБЫТИЯ
        
        // Десктоп события
        canvas.addEventListener('click', handleSelection);
        canvas.addEventListener('dblclick', () => this.resetCamera());
        
        // Мобильные события
        canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        
        // Предотвращаем контекстное меню на канвасе
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Обработка изменения размера
        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('orientationchange', () => {
            // Даем время на изменение ориентации
            setTimeout(() => this.onWindowResize(), 150);
        });
    }
    
    setupUIListeners() {
        // Выбор модели из списка
        document.querySelectorAll('.model-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const modelName = item.dataset.model;
                this.selectModel(modelName);
                
                document.querySelectorAll('.model-item').forEach(i => {
                    i.classList.remove('active');
                });
                item.classList.add('active');
            });
            
            // Добавляем обработчик касания для мобильных
            item.addEventListener('touchend', (e) => {
                e.preventDefault();
                const modelName = item.dataset.model;
                this.selectModel(modelName);
                
                document.querySelectorAll('.model-item').forEach(i => {
                    i.classList.remove('active');
                });
                item.classList.add('active');
            });
        });
        
        // Кнопки управления
        document.getElementById('reset-view').addEventListener('click', () => this.resetCamera());
        document.getElementById('auto-rotate').addEventListener('click', (e) => this.toggleAutoRotate(e.target));
        document.getElementById('toggle-grid').addEventListener('click', (e) => this.toggleGrid(e.target));
        document.getElementById('toggle-axes').addEventListener('click', (e) => this.toggleAxes(e.target));
        
        // Всплывающее окно
        document.getElementById('close-popup').addEventListener('click', () => this.hidePopup());
        document.getElementById('view-details').addEventListener('click', () => this.viewDetails());
        document.getElementById('add-to-cart').addEventListener('click', () => this.addToCart());
        document.getElementById('highlight-part').addEventListener('click', () => this.highlightSelected());
        document.getElementById('view-cart').addEventListener('click', () => this.viewCart());
        
        // Закрытие попапа при касании вне его
        document.addEventListener('touchstart', (e) => {
            const popup = document.getElementById('selection-popup');
            if (popup.style.display === 'block' && !popup.contains(e.target)) {
                this.hidePopup();
                this.clearSelection();
            }
        });
    }
    
    setupDeviceSpecificSettings() {
        // Показываем предупреждение на мобильных
        if (this.isMobile) {
            document.querySelector('.device-warning').classList.add('mobile');
            document.getElementById('touch-status').style.display = 'inline';
            
            // Отключаем автовращение по умолчанию на мобильных
            this.autoRotate = false;
            this.controls.autoRotate = false;
            document.getElementById('auto-rotate').classList.remove('active');
        }
    }
    
    // Остальные методы класса (loadModel, selectObject, clearSelection, showPopup, 
    // hidePopup, updateInfoPanel, selectModel, resetCamera, toggleAutoRotate, 
    // toggleGrid, toggleAxes, viewDetails, addToCart, highlightSelected, viewCart, 
    // updateCartDisplay, showNotification, updatePolygonCount, getModelDisplayName, 
    // onWindowResize, updateFPS, animate) остаются такими же, как в предыдущей версии,
    // но с учетом проверок this.isMobile для оптимизации
    
    // Пример оптимизированного метода onWindowResize:
    onWindowResize() {
        const canvas = document.getElementById('three-canvas');
        if (!canvas) return;
        
        // Ждем немного на мобильных для стабилизации
        if (this.isMobile) {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.performResize(canvas);
            }, 100);
        } else {
            this.performResize(canvas);
        }
    }
    
    performResize(canvas) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        
        if (this.camera && this.renderer) {
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height, false);
            
            // Оптимизация pixel ratio для мобильных
            const pixelRatio = this.isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio;
            this.renderer.setPixelRatio(pixelRatio);
        }
        
        if (this.controls) {
            this.controls.update();
        }
    }
    
    // Вспомогательные методы для мобильных
    showContextMenu(event) {
        // Можно реализовать контекстное меню для мобильных
        console.log('Long press detected');
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Небольшая задержка для стабилизации на мобильных
    setTimeout(() => {
        const viewer = new ModelViewer();
        window.modelViewer = viewer; // Для отладки
        
        // Добавляем стили для анимации уведомлений
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            .notification {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #2ecc71;
                color: white;
                padding: 15px 25px;
                border-radius: 8px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                z-index: 1000;
                animation: slideInRight 0.3s ease;
                max-width: 300px;
                word-wrap: break-word;
            }
        `;
        document.head.appendChild(style);
    }, this.isMobile ? 300 : 0);
});