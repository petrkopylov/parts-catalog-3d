// Убедимся, что Three.js загружен перед созданием класса
if (typeof THREE === 'undefined') {
    console.error('Three.js не загружен! Проверьте подключение скрипта.');
}

// Основной класс для управления 3D сценой с поддержкой тачскрина
class ModelViewer {
    constructor() {
        // Проверяем доступность Three.js
        if (typeof THREE === 'undefined') {
            throw new Error('Three.js не найден. Убедитесь, что он подключен перед этим скриптом.');
        }
        
        // Основные переменные Three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = null;
        this.mouse = new THREE.Vector2();
        
        // Текущая модель и объекты
        this.currentModel = null;
        this.currentModelName = 'assembly'; // Имя файла сборки
        this.selectedObject = null;
        this.objects = []; // Все объекты для Raycaster
        
        // Детали сборки
        this.allParts = []; // Все детали сборки
        this.highlightedParts = new Set(); // Выделенные детали
        
        // Настройки
        this.autoRotate = false;
        this.showGrid = true;
        this.showAxes = false;
        this.grid = null;
        this.axes = null;
        
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
        
        // Инициализируем после небольшой задержки для стабильности
        setTimeout(() => {
            try {
                this.init();
            } catch (error) {
                console.error('Ошибка инициализации ModelViewer:', error);
                this.showFatalError('Ошибка инициализации 3D просмотрщика');
            }
        }, 100);
    }
    
    // ============ ОСНОВНЫЕ МЕТОДЫ ИНИЦИАЛИЗАЦИИ ============
    
    checkMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               window.innerWidth <= 768;
    }
    
    init() {
        console.log('Инициализация ModelViewer...');
        
        try {
            this.setupScene();
            this.setupCamera();
            this.setupRenderer();
            this.setupControls();
            this.setupLights();
            this.setupHelpers();
            this.setupEventListeners();
            this.setupUIListeners();
            this.setupDeviceSpecificSettings();
            
            // Загружаем сборку (один файл со всеми деталями)
            this.loadAssembly('assembly');
            
            // Запускаем анимацию
            this.animate();
            
            console.log('ModelViewer успешно инициализирован');
        } catch (error) {
            console.error('Ошибка в init():', error);
            this.showFatalError('Не удалось инициализировать 3D сцену');
        }
    }
    
    // ============ КРИТИЧЕСКИ ВАЖНЫЙ МЕТОД: ЗАГРУЗКА СБОРКИ ============
    
    async loadAssembly(assemblyName) {
        console.log(`Загружаю сборку: ${assemblyName}.glb`);
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
        
        try {
            // Удаляем предыдущую модель
            if (this.currentModel) {
                this.scene.remove(this.currentModel);
                this.objects = [];
                this.allParts = [];
            }
            
            // Обновляем заголовок
            const titleElement = document.getElementById('current-model-title');
            if (titleElement) {
                titleElement.textContent = 'Сборка деталей';
            }
            
            // Пробуем загрузить модель с разных путей
            const possiblePaths = [
                `models/${assemblyName}.glb`,
                `./models/${assemblyName}.glb`,
                `${window.location.pathname.includes('github.io') ? window.location.pathname.split('/').slice(0, -1).join('/') : ''}/models/${assemblyName}.glb`
            ];
            
            let gltf = null;
            let lastError = null;
            
            // Пробуем загрузить по каждому пути
            for (const modelPath of possiblePaths) {
                try {
                    console.log(`Пробую путь: ${modelPath}`);
                    const loader = new THREE.GLTFLoader();
                    gltf = await loader.loadAsync(modelPath);
                    console.log(`Успешно загружено с пути: ${modelPath}`);
                    break;
                } catch (error) {
                    lastError = error;
                    console.warn(`Не удалось загрузить с пути ${modelPath}:`, error.message);
                }
            }
            
            if (!gltf) {
                throw new Error(`Не удалось загрузить сборку. Последняя ошибка: ${lastError?.message}`);
            }
            
            this.currentModel = gltf.scene;
            this.currentModelName = assemblyName;
            
            // Собираем ВСЕ mesh-объекты из сборки
            this.allParts = [];
            this.objects = [];
            
            this.currentModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // Сохраняем оригинальный материал для подсветки
                    child.userData.originalMaterial = child.material;
                    child.userData.objectName = child.name || `Деталь_${this.allParts.length}`;
                    child.userData.isPart = true; // Флаг, что это деталь сборки
                    child.userData.partId = this.allParts.length; // Уникальный ID детали
                    
                    this.allParts.push(child);
                    this.objects.push(child); // Добавляем в массив для Raycaster
                    
                    console.log(`Найдена деталь: ${child.userData.objectName}`);
                }
            });
            
            // Центрируем сборку
            const box = new THREE.Box3().setFromObject(this.currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            this.currentModel.position.x -= center.x;
            this.currentModel.position.y -= center.y;
            this.currentModel.position.z -= center.z;
            
            // Настраиваем камеру для просмотра всей сборки
            this.fitCameraToAssembly();
            
            this.scene.add(this.currentModel);
            
            // Обновляем статистику полигонов
            this.updatePolygonCount();
            
            // Обновляем интерфейс: показываем список деталей
            this.updatePartsList();
            
            // Скрываем индикатор загрузки
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            
            console.log(`Сборка загружена. Найдено деталей: ${this.allParts.length}`);
            
        } catch (error) {
            console.error('Критическая ошибка загрузки сборки:', error);
            
            // Показываем понятное сообщение об ошибке
            if (loadingIndicator) {
                loadingIndicator.innerHTML = `
                    <div style="color: #e74c3c; text-align: center;">
                        <p><i class="fas fa-exclamation-triangle" style="font-size: 2em;"></i></p>
                        <p><strong>Ошибка загрузки сборки</strong></p>
                        <p>${error.message}</p>
                        <p>Проверьте:</p>
                        <p>1. Файл ${assemblyName}.glb в папке models/</p>
                        <p>2. Консоль браузера (F12) для подробностей</p>
                        <p><button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Обновить страницу
                        </button></p>
                    </div>
                `;
            }
            
            // Создаем простую тестовую сборку как запасной вариант
            this.createFallbackAssembly();
        }
    }
    
    // Настройка камеры для просмотра всей сборки
    fitCameraToAssembly() {
        if (!this.currentModel) return;
        
        const box = new THREE.Box3().setFromObject(this.currentModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.8; // Отступ
        
        this.camera.position.set(cameraZ, cameraZ * 0.7, cameraZ);
        this.camera.lookAt(center);
        this.controls.target.copy(center);
        this.controls.update();
    }
    
    // Фокусировка камеры на конкретной детали
    focusOnObject(object, duration = 1000) {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 2.5;
        
        const targetPosition = new THREE.Vector3(
            center.x + cameraZ * 0.7,
            center.y + cameraZ * 0.5,
            center.z + cameraZ * 0.7
        );
        
        // Плавное перемещение камеры
        this.controls.target.copy(center);
        
        const startPosition = this.camera.position.clone();
        const startTime = Date.now();
        
        const animateCamera = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Кубическая интерполяция для плавности
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            this.camera.position.lerpVectors(startPosition, targetPosition, easeProgress);
            this.controls.update();
            
            if (progress < 1) {
                requestAnimationFrame(animateCamera);
            }
        };
        
        animateCamera();
    }
    
    // Создание тестовой сборки, если загрузка не удалась
    createFallbackAssembly() {
        console.log('Создаю тестовую сборку...');
        
        // Создаем группу для сборки
        this.currentModel = new THREE.Group();
        this.currentModel.name = 'Тестовая сборка';
        
        // Создаем несколько тестовых деталей
        const parts = [
            { name: 'Корпус', color: 0x3498db, position: [0, 0, 0], size: [3, 2, 1] },
            { name: 'Крышка', color: 0x2ecc71, position: [0, 1.5, 0], size: [2.8, 0.3, 0.9] },
            { name: 'Болт М8', color: 0xe74c3c, position: [1, 0.5, 0.4], size: [0.2, 1, 0.2] },
            { name: 'Шестерня', color: 0xf39c12, position: [-1, 0, 0], size: [1, 0.3, 1] }
        ];
        
        this.allParts = [];
        this.objects = [];
        
        parts.forEach((partData, index) => {
            const geometry = new THREE.BoxGeometry(...partData.size);
            const material = new THREE.MeshStandardMaterial({ 
                color: partData.color,
                roughness: 0.3,
                metalness: 0.7
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...partData.position);
            mesh.name = partData.name;
            
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.originalMaterial = material;
            mesh.userData.objectName = partData.name;
            mesh.userData.isPart = true;
            mesh.userData.partId = index;
            
            this.currentModel.add(mesh);
            this.allParts.push(mesh);
            this.objects.push(mesh);
        });
        
        this.scene.add(this.currentModel);
        this.fitCameraToAssembly();
        this.updatePartsList();
        this.updatePolygonCount();
        
        console.log('Тестовая сборка создана');
    }
    
    // Обновление списка деталей в интерфейсе
    updatePartsList() {
        const partsList = document.getElementById('parts-list');
        const partsCount = document.getElementById('parts-count');
        const assemblyName = document.getElementById('assembly-name');
        
        if (!partsList) return;
        
        partsList.innerHTML = '';
        
        if (this.allParts.length === 0) {
            partsList.innerHTML = '<p class="no-parts">Детали не найдены</p>';
            if (partsCount) partsCount.textContent = 'Деталей: 0';
            if (assemblyName) assemblyName.textContent = 'Сборка не загружена';
            return;
        }
        
        // Сортируем детали по имени
        const sortedParts = [...this.allParts].sort((a, b) => 
            a.userData.objectName.localeCompare(b.userData.objectName)
        );
        
        // Создаем элемент для каждой детали
        sortedParts.forEach((part) => {
            const partItem = document.createElement('div');
            partItem.className = 'part-item';
            partItem.dataset.partId = part.userData.partId;
            
            const icon = this.getPartIcon(part.userData.objectName);
            
            partItem.innerHTML = `
                <div class="model-icon">${icon}</div>
                <div class="model-info">
                    <h4>${part.userData.objectName}</h4>
                    <p>ID: ${part.userData.partId}</p>
                </div>
                <div class="part-toggle">
                    <i class="fas fa-eye" data-action="show"></i>
                </div>
            `;
            
            // Клик на деталь в списке
            partItem.addEventListener('click', (e) => {
                if (!e.target.classList.contains('part-toggle') && 
                    !e.target.closest('.part-toggle')) {
                    this.selectObject(part);
                    this.focusOnObject(part);
                }
            });
            
            // Кнопка показа/скрытия детали
            const toggleBtn = partItem.querySelector('.part-toggle');
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const icon = e.target.closest('i');
                if (icon.dataset.action === 'show') {
                    this.hidePart(part);
                    icon.className = 'fas fa-eye-slash';
                    icon.dataset.action = 'hide';
                    partItem.classList.add('hidden');
                } else {
                    this.showPart(part);
                    icon.className = 'fas fa-eye';
                    icon.dataset.action = 'show';
                    partItem.classList.remove('hidden');
                }
            });
            
            partsList.appendChild(partItem);
        });
        
        if (partsCount) {
            partsCount.textContent = `Деталей: ${this.allParts.length}`;
        }
        
        if (assemblyName) {
            assemblyName.textContent = this.currentModelName === 'assembly' ? 'Основная сборка' : this.currentModelName;
        }
    }
    
    // Подсветка детали в списке
    highlightPartInList(part) {
        const partItems = document.querySelectorAll('.part-item');
        partItems.forEach(item => {
            item.classList.remove('active');
            const partId = parseInt(item.dataset.partId);
            if (this.allParts[partId] === part) {
                item.classList.add('active');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }
    
    // Получение иконки для детали
    getPartIcon(partName) {
        const name = partName.toLowerCase();
        
        if (name.includes('болт') || name.includes('винт') || name.includes('крепеж') || name.includes('bolt')) {
            return '🔩';
        } else if (name.includes('шестерн') || name.includes('зубч') || name.includes('gear')) {
            return '⚙️';
        } else if (name.includes('подшипник') || name.includes('bearing')) {
            return '🛞';
        } else if (name.includes('корпус') || name.includes('коробка') || name.includes('housing') || name.includes('body')) {
            return '📦';
        } else if (name.includes('вал') || name.includes('ось') || name.includes('shaft')) {
            return '⎚';
        } else if (name.includes('пружина') || name.includes('spring')) {
            return '🔄';
        } else if (name.includes('крышка') || name.includes('cover') || name.includes('lid')) {
            return '🛡️';
        } else if (name.includes('панель') || name.includes('panel')) {
            return '🧱';
        } else if (name.includes('кожух') || name.includes('guard')) {
            return '🛡️';
        } else if (name.includes('гайка') || name.includes('nut')) {
            return '⛓️';
        } else if (name.includes('шайба') || name.includes('washer')) {
            return '⭕';
        } else if (name.includes('втулка') || name.includes('bushing')) {
            return '🔘';
        } else {
            return '🔧';
        }
    }
    
    // ============ ОСТАЛЬНЫЕ МЕТОДЫ КЛАССА ============
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        if (!this.isMobile) {
            this.scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);
        }
    }
    
    setupCamera() {
        const canvas = document.getElementById('three-canvas');
        if (!canvas) {
            throw new Error('Canvas элемент не найден!');
        }
        
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
        if (!canvas) {
            throw new Error('Canvas элемент не найден!');
        }
        
        const rendererOptions = {
            canvas: canvas,
            antialias: !this.isMobile,
            alpha: true,
            powerPreference: 'high-performance'
        };
        
        this.renderer = new THREE.WebGLRenderer(rendererOptions);
        
        const pixelRatio = this.isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio;
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        
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
        this.controls.maxDistance = 100;
        this.controls.maxPolarAngle = Math.PI;
        
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
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7);
        if (!this.isMobile) {
            directionalLight.castShadow = true;
        }
        this.scene.add(directionalLight);
        
        const ambientLight = new THREE.AmbientLight(0x404040, this.isMobile ? 0.7 : 0.5);
        this.scene.add(ambientLight);
        
        if (!this.isMobile) {
            const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
            backLight.position.set(-5, 5, -5);
            this.scene.add(backLight);
        }
    }
    
    setupHelpers() {
        this.grid = new THREE.GridHelper(30, 30, 0x444444, 0x222222);
        this.grid.position.y = -0.01;
        this.grid.visible = this.showGrid;
        this.scene.add(this.grid);
        
        this.axes = new THREE.AxesHelper(10);
        this.axes.visible = this.showAxes;
        this.scene.add(this.axes);
        
        this.raycaster = new THREE.Raycaster();
        
        this.highlightBox = new THREE.BoxHelper(new THREE.Mesh(), 0x00ff00);
        this.highlightBox.visible = false;
        this.scene.add(this.highlightBox);
    }
    
    setupEventListeners() {
        const canvas = this.renderer.domElement;
        
        const getNormalizedCoordinates = (event) => {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            
            if (event.type.includes('touch')) {
                if (event.touches.length > 0) {
                    clientX = event.touches[0].clientX;
                    clientY = event.touches[0].clientY;
                } else if (event.changedTouches.length > 0) {
                    clientX = event.changedTouches[0].clientX;
                    clientY = event.changedTouches[0].clientY;
                } else {
                    return null;
                }
            } else {
                clientX = event.clientX;
                clientY = event.clientY;
            }
            
            return {
                x: ((clientX - rect.left) / rect.width) * 2 - 1,
                y: -((clientY - rect.top) / rect.height) * 2 + 1
            };
        };
        
        const handleSelection = (event) => {
            if (event.cancelable) {
                event.preventDefault();
            }
            
            const coords = getNormalizedCoordinates(event);
            if (!coords) return;
            
            this.mouse.set(coords.x, coords.y);
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.objects);
            
            if (intersects.length > 0) {
                const object = intersects[0].object;
                // Проверяем, что это деталь сборки
                if (object.userData.isPart) {
                    this.selectObject(object);
                    
                    if (this.isMobile && navigator.vibrate) {
                        navigator.vibrate(30);
                    }
                }
            } else {
                this.hidePopup();
                this.clearSelection();
            }
        };
        
        const handleTouchStart = (event) => {
            if (event.touches.length === 1) {
                this.touchStartX = event.touches[0].clientX;
                this.touchStartY = event.touches[0].clientY;
                
                this.touchTimeout = setTimeout(() => {
                    // Долгое нажатие - показать контекстное меню
                    if (this.selectedObject) {
                        this.showContextMenu(event);
                    }
                }, 500);
            }
        };
        
        const handleTouchEnd = (event) => {
            if (this.touchTimeout) {
                clearTimeout(this.touchTimeout);
                this.touchTimeout = null;
            }
            
            if (event.changedTouches.length === 1) {
                const touch = event.changedTouches[0];
                const deltaX = Math.abs(touch.clientX - this.touchStartX);
                const deltaY = Math.abs(touch.clientY - this.touchStartY);
                
                if (deltaX < 10 && deltaY < 10) {
                    handleSelection(event);
                }
            }
            
            const currentTime = Date.now();
            if (currentTime - this.lastTouchTime < 300) {
                this.resetCamera();
                if (event.cancelable) event.preventDefault();
            }
            this.lastTouchTime = currentTime;
        };
        
        // Подписка на события
        canvas.addEventListener('click', handleSelection);
        canvas.addEventListener('dblclick', () => this.resetCamera());
        canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
        
        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.onWindowResize(), 150);
        });
    }
    
    setupUIListeners() {
        // Кнопка "Показать все детали"
        const showAllBtn = document.getElementById('show-all');
        if (showAllBtn) {
            showAllBtn.addEventListener('click', () => {
                this.showAllParts();
            });
        }
        
        // Кнопки управления
        const resetBtn = document.getElementById('reset-view');
        const autoRotateBtn = document.getElementById('auto-rotate');
        const toggleGridBtn = document.getElementById('toggle-grid');
        const toggleAxesBtn = document.getElementById('toggle-axes');
        
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetCamera());
        if (autoRotateBtn) autoRotateBtn.addEventListener('click', (e) => this.toggleAutoRotate(e.target));
        if (toggleGridBtn) toggleGridBtn.addEventListener('click', (e) => this.toggleGrid(e.target));
        if (toggleAxesBtn) toggleAxesBtn.addEventListener('click', (e) => this.toggleAxes(e.target));
        
        // Всплывающее окно
        const closePopupBtn = document.getElementById('close-popup');
        const viewDetailsBtn = document.getElementById('view-details');
        const addToCartBtn = document.getElementById('add-to-cart');
        const highlightPartBtn = document.getElementById('highlight-part');
        const viewCartBtn = document.getElementById('view-cart');
        
        if (closePopupBtn) closePopupBtn.addEventListener('click', () => this.hidePopup());
        if (viewDetailsBtn) viewDetailsBtn.addEventListener('click', () => this.viewDetails());
        if (addToCartBtn) addToCartBtn.addEventListener('click', () => this.addToCart());
        if (highlightPartBtn) highlightPartBtn.addEventListener('click', () => this.highlightSelected());
        if (viewCartBtn) viewCartBtn.addEventListener('click', () => this.viewCart());
        
        // Закрытие попапа при касании вне его
        document.addEventListener('touchstart', (e) => {
            const popup = document.getElementById('selection-popup');
            if (popup && popup.style.display === 'block' && !popup.contains(e.target)) {
                this.hidePopup();
                this.clearSelection();
            }
        });
    }
    
    setupDeviceSpecificSettings() {
        const deviceWarning = document.querySelector('.device-warning');
        const touchStatus = document.getElementById('touch-status');
        const autoRotateBtn = document.getElementById('auto-rotate');
        
        if (this.isMobile) {
            if (deviceWarning) deviceWarning.classList.add('mobile');
            if (touchStatus) touchStatus.style.display = 'inline';
            this.autoRotate = false;
            this.controls.autoRotate = false;
            if (autoRotateBtn) autoRotateBtn.classList.remove('active');
        }
    }
    
    // ============ МЕТОДЫ ДЛЯ РАБОТЫ С ДЕТАЛЯМИ СБОРКИ ============
    
    selectObject(object) {
        // Проверяем, что это деталь сборки
        if (!object.userData.isPart) return;
        
        this.clearSelection();
        this.selectedObject = object;
        
        // Подсветка выбранной детали
        this.highlightBox.setFromObject(object);
        this.highlightBox.visible = true;
        
        // Добавляем свечение к материалу
        if (object.material) {
            if (Array.isArray(object.material)) {
                object.material.forEach(mat => {
                    if (mat.emissive) {
                        mat.emissive.setHex(0x00ff00);
                        mat.emissiveIntensity = 0.5;
                    }
                });
            } else if (object.material.emissive) {
                object.material.emissive.setHex(0x00ff00);
                object.material.emissiveIntensity = 0.5;
            }
        }
        
        this.highlightedParts.add(object);
        
        // Показываем информацию о детали
        this.showPopup(object);
        this.updateInfoPanel(object);
        this.updateSelectionStatus(true);
        
        // Подсвечиваем в списке
        this.highlightPartInList(object);
    }
    
    clearSelection() {
        if (this.selectedObject && this.selectedObject.userData.originalMaterial) {
            if (Array.isArray(this.selectedObject.material)) {
                this.selectedObject.material = this.selectedObject.userData.originalMaterial;
            } else {
                this.selectedObject.material = this.selectedObject.userData.originalMaterial;
            }
        }
        
        // Убираем свечение со всех выделенных деталей
        this.highlightedParts.forEach(part => {
            if (part.userData.originalMaterial) {
                if (Array.isArray(part.material)) {
                    part.material = part.userData.originalMaterial;
                } else {
                    part.material = part.userData.originalMaterial;
                }
            }
        });
        
        this.selectedObject = null;
        this.highlightedParts.clear();
        this.highlightBox.visible = false;
        
        // Снимаем подсветку со всех элементов в списке
        const partItems = document.querySelectorAll('.part-item');
        partItems.forEach(item => {
            item.classList.remove('active');
        });
        
        this.updateSelectionStatus(false);
    }
    
    showAllParts() {
        this.allParts.forEach(part => {
            this.showPart(part);
        });
        
        // Обновляем иконки в списке
        const partItems = document.querySelectorAll('.part-item');
        partItems.forEach(item => {
            const icon = item.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-eye';
                icon.dataset.action = 'show';
            }
            item.classList.remove('hidden');
        });
    }
    
    hidePart(part) {
        part.visible = false;
        if (this.selectedObject === part) {
            this.clearSelection();
        }
    }
    
    showPart(part) {
        part.visible = true;
    }
    
    // ============ ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ============
    
    showPopup(object) {
        const popup = document.getElementById('selection-popup');
        if (!popup) return;
        
        const objectName = object.userData.objectName || 'Деталь';
        
        const nameElement = document.getElementById('selected-object-name');
        const idElement = document.getElementById('selected-object-id');
        const materialElement = document.getElementById('selected-object-material');
        const polygonsElement = document.getElementById('selected-object-polygons');
        
        if (nameElement) nameElement.textContent = objectName;
        if (idElement) idElement.textContent = object.userData.partId || '-';
        if (materialElement) materialElement.textContent = 
            object.material ? object.material.type.replace('Material', '') : '-';
        
        if (object.geometry && polygonsElement) {
            const polygonCount = object.geometry.index ? 
                object.geometry.index.count / 3 : 
                object.geometry.attributes.position.count / 3;
            polygonsElement.textContent = Math.round(polygonCount).toLocaleString();
        }
        
        popup.style.display = 'block';
    }
    
    hidePopup() {
        const popup = document.getElementById('selection-popup');
        if (popup) {
            popup.style.display = 'none';
        }
    }
    
    updateInfoPanel(object) {
        const objectName = object.userData.objectName || 'Деталь';
        const geometry = object.geometry;
        
        const nameElement = document.getElementById('info-object-name');
        if (nameElement) nameElement.textContent = objectName;
        
        const paramsList = document.getElementById('info-parameters');
        if (!paramsList) return;
        
        paramsList.innerHTML = '';
        
        if (geometry) {
            const vertices = geometry.attributes.position ? 
                geometry.attributes.position.count : 0;
            const triangles = geometry.index ? 
                geometry.index.count / 3 : 
                vertices / 3;
            
            const params = [
                { label: 'Вершин', value: vertices.toLocaleString() },
                { label: 'Треугольников', value: Math.round(triangles).toLocaleString() },
                { label: 'ID детали', value: object.userData.partId || '-' },
                { label: 'Материал', value: object.material ? object.material.type.replace('Material', '') : '-' },
                { label: 'Видимость', value: object.visible ? 'Да' : 'Нет' }
            ];
            
            params.forEach(param => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${param.label}:</strong> <span>${param.value}</span>`;
                paramsList.appendChild(li);
            });
        }
    }
    
    updateSelectionStatus(isSelected) {
        const statusIndicator = document.getElementById('selection-status');
        if (!statusIndicator) return;
        
        const statusDot = statusIndicator.querySelector('.status-dot');
        const statusText = statusIndicator.querySelector('span:last-child');
        
        if (statusDot && statusText) {
            if (isSelected) {
                statusDot.style.backgroundColor = '#2ecc71';
                statusDot.classList.add('active');
                statusText.textContent = 'Деталь выбрана';
            } else {
                statusDot.style.backgroundColor = '#e74c3c';
                statusDot.classList.remove('active');
                statusText.textContent = 'Не выбрано';
            }
        }
    }
    
    resetCamera() {
        this.fitCameraToAssembly();
    }
    
    toggleAutoRotate(button) {
        this.autoRotate = !this.autoRotate;
        this.controls.autoRotate = this.autoRotate;
        
        if (button) {
            button.classList.toggle('active');
            button.innerHTML = this.autoRotate ? 
                '<i class="fas fa-sync-alt"></i> Вращение' : 
                '<i class="fas fa-ban"></i> Вращение';
        }
    }
    
    toggleGrid(button) {
        this.showGrid = !this.showGrid;
        if (this.grid) {
            this.grid.visible = this.showGrid;
        }
        
        if (button) {
            button.classList.toggle('active');
            button.innerHTML = this.showGrid ? 
                '<i class="fas fa-th"></i> Сетка' : 
                '<i class="fas fa-th-large"></i> Сетка';
        }
    }
    
    toggleAxes(button) {
        this.showAxes = !this.showAxes;
        if (this.axes) {
            this.axes.visible = this.showAxes;
        }
        
        if (button) {
            button.classList.toggle('active');
            button.innerHTML = this.showAxes ? 
                '<i class="fas fa-crosshairs"></i> Оси' : 
                '<i class="fas fa-times"></i> Оси';
        }
    }
    
    viewDetails() {
        if (this.selectedObject) {
            const objectName = this.selectedObject.userData.objectName || 'Деталь';
            alert(`Карточка детали: ${objectName}\n\nID: ${this.selectedObject.userData.partId}\n\nЗдесь будет полная информация о выбранной детали.`);
        }
    }
    
    addToCart() {
        if (this.selectedObject) {
            const objectName = this.selectedObject.userData.objectName || 'Деталь';
            const modelName = 'Сборка деталей';
            
            const item = {
                id: Date.now(),
                name: objectName,
                model: modelName,
                partId: this.selectedObject.userData.partId,
                objectId: this.selectedObject.id,
                timestamp: new Date().toLocaleTimeString()
            };
            
            this.cartItems.push(item);
            this.updateCartDisplay();
            this.showNotification(`"${objectName}" добавлен в корзину`);
        }
    }
    
    highlightSelected() {
        if (this.selectedObject) {
            const originalScale = this.selectedObject.scale.clone();
            let scale = 1;
            let direction = 0.02;
            
            const animate = () => {
                scale += direction;
                if (scale > 1.2) direction = -0.02;
                if (scale < 0.8) direction = 0.02;
                
                this.selectedObject.scale.set(
                    originalScale.x * scale,
                    originalScale.y * scale,
                    originalScale.z * scale
                );
                
                requestAnimationFrame(animate);
            };
            
            animate();
            setTimeout(() => {
                this.selectedObject.scale.copy(originalScale);
            }, 2000);
        }
    }
    
    viewCart() {
        if (this.cartItems.length === 0) {
            alert('Корзина пуста!');
        } else {
            const itemsList = this.cartItems.map(item => 
                `• ${item.name} (ID: ${item.partId}) - ${item.timestamp}`
            ).join('\n');
            alert(`Деталей в корзине: ${this.cartItems.length}\n\n${itemsList}`);
        }
    }
    
    updateCartDisplay() {
        const cartEmpty = document.getElementById('cart-empty');
        const cartList = document.getElementById('cart-items-list');
        
        if (cartEmpty && cartList) {
            if (this.cartItems.length === 0) {
                cartEmpty.style.display = 'block';
                cartList.style.display = 'none';
            } else {
                cartEmpty.style.display = 'none';
                cartList.style.display = 'block';
                
                cartList.innerHTML = '';
                this.cartItems.slice(-3).forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'cart-item';
                    li.innerHTML = `
                        <strong>${item.name}</strong>
                        <span>ID: ${item.partId}</span>
                        <small>${item.timestamp}</small>
                    `;
                    cartList.appendChild(li);
                });
                
                if (this.cartItems.length > 3) {
                    const more = document.createElement('li');
                    more.textContent = `...и ещё ${this.cartItems.length - 3} деталей`;
                    cartList.appendChild(more);
                }
            }
        }
    }
    
    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
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
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    updatePolygonCount() {
        let totalPolygons = 0;
        
        this.allParts.forEach(object => {
            if (object.geometry) {
                const count = object.geometry.index ? 
                    object.geometry.index.count / 3 : 
                    object.geometry.attributes.position.count / 3;
                totalPolygons += Math.round(count);
            }
        });
        
        this.stats.polygonCount = totalPolygons;
        const polygonCountElement = document.getElementById('polygon-count');
        if (polygonCountElement) {
            polygonCountElement.textContent = `Полигонов: ${totalPolygons.toLocaleString()}`;
        }
    }
    
    onWindowResize() {
        const canvas = document.getElementById('three-canvas');
        if (!canvas) return;
        
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
            
            const pixelRatio = this.isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio;
            this.renderer.setPixelRatio(pixelRatio);
        }
        
        if (this.controls) {
            this.controls.update();
        }
    }
    
    showContextMenu(event) {
        console.log('Long press detected on:', this.selectedObject?.userData?.objectName);
        // Можно добавить контекстное меню для деталей
    }
    
    showFatalError(message) {
        const canvasContainer = document.querySelector('.canvas-container');
        if (canvasContainer) {
            canvasContainer.innerHTML = `
                <div style="color: #e74c3c; text-align: center; padding: 50px;">
                    <p><i class="fas fa-exclamation-triangle" style="font-size: 3em;"></i></p>
                    <h2>Критическая ошибка</h2>
                    <p>${message}</p>
                    <p>Пожалуйста, обновите страницу или проверьте консоль браузера (F12).</p>
                    <p><button onclick="location.reload()" style="margin-top: 20px; padding: 12px 24px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;">
                        Обновить страницу
                    </button></p>
                </div>
            `;
        }
    }
    
    updateFPS() {
        const now = performance.now();
        
        if (this.stats.lastTime) {
            const delta = now - this.stats.lastTime;
            this.stats.frameCount++;
            
            if (delta >= 1000) {
                this.stats.fps = Math.round((this.stats.frameCount * 1000) / delta);
                this.stats.frameCount = 0;
                this.stats.lastTime = now;
                
                const fpsElement = document.getElementById('fps-counter');
                if (fpsElement) {
                    fpsElement.textContent = `FPS: ${this.stats.fps}`;
                }
            }
        } else {
            this.stats.lastTime = now;
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.updateFPS();
        
        if (this.autoRotate && this.controls) {
            this.controls.update();
        }
        
        if (this.currentModel && this.autoRotate) {
            this.currentModel.rotation.y += 0.002;
        }
        
        if (this.highlightBox && this.highlightBox.visible && this.selectedObject) {
            this.highlightBox.setFromObject(this.selectedObject);
            this.highlightBox.updateMatrixWorld(true);
        }
        
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Добавляем стили для анимации уведомлений и списка деталей
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
        .cart-item {
            padding: 8px;
            margin-bottom: 8px;
            background: white;
            border-radius: 6px;
            border-left: 3px solid #3498db;
        }
        .cart-item strong {
            display: block;
            color: #2c3e50;
        }
        .cart-item span {
            color: #7f8c8d;
            font-size: 0.9rem;
        }
        .cart-item small {
            display: block;
            color: #95a5a6;
            font-size: 0.8rem;
            margin-top: 4px;
        }
        .part-item.hidden {
            opacity: 0.5;
            background: #f0f0f0;
        }
        .part-item.hidden .model-info h4 {
            text-decoration: line-through;
            color: #95a5a6;
        }
    `;
    document.head.appendChild(style);
    
    // Проверяем, что Three.js загружен
    if (typeof THREE === 'undefined') {
        console.error('Three.js не загружен!');
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #e74c3c; color: white; padding: 15px; text-align: center; z-index: 9999;';
        errorDiv.innerHTML = 'Ошибка: Three.js не загружен. Проверьте подключение к интернету и обновите страницу.';
        document.body.appendChild(errorDiv);
        return;
    }
    
    // Запускаем с небольшой задержкой для стабилизации
    setTimeout(() => {
        try {
            const viewer = new ModelViewer();
            window.modelViewer = viewer; // Для отладки в консоли
            console.log('ModelViewer инициализирован в режиме сборки');
        } catch (error) {
            console.error('Ошибка создания ModelViewer:', error);
            
            // Показываем ошибку пользователю
            const canvasContainer = document.querySelector('.canvas-container');
            if (canvasContainer) {
                canvasContainer.innerHTML = `
                    <div style="color: #e74c3c; text-align: center; padding: 50px;">
                        <p><i class="fas fa-exclamation-triangle" style="font-size: 3em;"></i></p>
                        <h2>Ошибка инициализации 3D просмотрщика</h2>
                        <p>${error.message}</p>
                        <p>Пожалуйста, обновите страницу.</p>
                        <p><button onclick="location.reload()" style="margin-top: 20px; padding: 12px 24px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;">
                            Обновить страницу
                        </button></p>
                    </div>
                `;
            }
        }
    }, 100);
});