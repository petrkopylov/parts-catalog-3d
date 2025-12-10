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
        
        this.init();
    }
    
    // ============ ОСНОВНЫЕ МЕТОДЫ ИНИЦИАЛИЗАЦИИ ============
    
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
    
    // ============ КРИТИЧЕСКИ ВАЖНЫЙ МЕТОД: ЗАГРУЗКА МОДЕЛИ ============
    
    async loadModel(modelName) {
        console.log(`Пытаюсь загрузить модель: ${modelName}.glb`);
        const loadingIndicator = document.getElementById('loading-indicator');
        loadingIndicator.style.display = 'flex';
        
        try {
            // Удаляем предыдущую модель
            if (this.currentModel) {
                this.scene.remove(this.currentModel);
                this.objects = [];
            }
            
            // Обновляем заголовок
            document.getElementById('current-model-title').textContent = 
                this.getModelDisplayName(modelName);
            
            // Пробуем загрузить модель с разных путей
            const possiblePaths = [
                `models/${modelName}.glb`,
                `./models/${modelName}.glb`,
                `${window.location.pathname.includes('github.io') ? window.location.pathname.split('/').slice(0, -1).join('/') : ''}/models/${modelName}.glb`
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
                    break; // Если загрузка успешна, выходим из цикла
                } catch (error) {
                    lastError = error;
                    console.warn(`Не удалось загрузить с пути ${modelPath}:`, error.message);
                }
            }
            
            if (!gltf) {
                throw new Error(`Не удалось загрузить модель ни по одному из путей. Последняя ошибка: ${lastError?.message}`);
            }
            
            this.currentModel = gltf.scene;
            this.currentModelName = modelName;
            
            // Настраиваем модель
            this.currentModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // Сохраняем оригинальный материал для подсветки
                    child.userData.originalMaterial = child.material;
                    child.userData.objectName = child.name || 'Деталь';
                    
                    // Добавляем в список объектов
                    this.objects.push(child);
                }
            });
            
            // Центрируем модель
            const box = new THREE.Box3().setFromObject(this.currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            this.currentModel.position.x -= center.x;
            this.currentModel.position.y -= center.y;
            this.currentModel.position.z -= center.z;
            
            // Настраиваем камеру
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = this.camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            cameraZ *= 1.5;
            
            this.camera.position.set(cameraZ, cameraZ, cameraZ);
            this.controls.target.set(0, 0, 0);
            this.controls.update();
            
            this.scene.add(this.currentModel);
            
            // Обновляем статистику полигонов
            this.updatePolygonCount();
            
            // Скрываем индикатор загрузки
            loadingIndicator.style.display = 'none';
            
        } catch (error) {
            console.error('Критическая ошибка загрузки модели:', error);
            
            // Показываем понятное сообщение об ошибке
            loadingIndicator.innerHTML = `
                <div style="color: #e74c3c; text-align: center;">
                    <p><i class="fas fa-exclamation-triangle" style="font-size: 2em;"></i></p>
                    <p><strong>Ошибка загрузки модели</strong></p>
                    <p>Проверьте:</p>
                    <p>1. Файл ${modelName}.glb в папке models/</p>
                    <p>2. Консоль браузера (F12) для подробностей</p>
                    <p><button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Обновить страницу
                    </button></p>
                </div>
            `;
            
            // Создаем простой куб как запасной вариант
            this.createFallbackCube();
        }
    }
    
    // Создание простого куба, если загрузка GLB не удалась
    createFallbackCube() {
        console.log('Создаю запасной куб...');
        
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x3498db,
            roughness: 0.3,
            metalness: 0.7
        });
        
        this.currentModel = new THREE.Mesh(geometry, material);
        this.currentModel.name = 'Куб (запасной)';
        
        // Настраиваем модель
        this.currentModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.originalMaterial = child.material;
                child.userData.objectName = child.name || 'Деталь';
                this.objects.push(child);
            }
        });
        
        this.scene.add(this.currentModel);
        this.updatePolygonCount();
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
        this.controls.maxDistance = 50;
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
        this.grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
        this.grid.position.y = -0.01;
        this.grid.visible = this.showGrid;
        this.scene.add(this.grid);
        
        this.axes = new THREE.AxesHelper(5);
        this.axes.visible = this.showAxes;
        this.scene.add(this.axes);
        
        this.raycaster = new THREE.Raycaster();
        
        this.highlightBox = new THREE.BoxHelper(new THREE.Mesh(), 0x3498db);
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
                this.selectObject(object);
                
                if (this.isMobile && navigator.vibrate) {
                    navigator.vibrate(50);
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
                    this.showContextMenu(event);
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
        document.querySelectorAll('.model-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const modelName = item.dataset.model;
                this.selectModel(modelName);
                
                document.querySelectorAll('.model-item').forEach(i => {
                    i.classList.remove('active');
                });
                item.classList.add('active');
            });
            
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
        
        document.getElementById('reset-view').addEventListener('click', () => this.resetCamera());
        document.getElementById('auto-rotate').addEventListener('click', (e) => this.toggleAutoRotate(e.target));
        document.getElementById('toggle-grid').addEventListener('click', (e) => this.toggleGrid(e.target));
        document.getElementById('toggle-axes').addEventListener('click', (e) => this.toggleAxes(e.target));
        document.getElementById('close-popup').addEventListener('click', () => this.hidePopup());
        document.getElementById('view-details').addEventListener('click', () => this.viewDetails());
        document.getElementById('add-to-cart').addEventListener('click', () => this.addToCart());
        document.getElementById('highlight-part').addEventListener('click', () => this.highlightSelected());
        document.getElementById('view-cart').addEventListener('click', () => this.viewCart());
        
        document.addEventListener('touchstart', (e) => {
            const popup = document.getElementById('selection-popup');
            if (popup.style.display === 'block' && !popup.contains(e.target)) {
                this.hidePopup();
                this.clearSelection();
            }
        });
    }
    
    setupDeviceSpecificSettings() {
        if (this.isMobile) {
            document.querySelector('.device-warning').classList.add('mobile');
            document.getElementById('touch-status').style.display = 'inline';
            this.autoRotate = false;
            this.controls.autoRotate = false;
            document.getElementById('auto-rotate').classList.remove('active');
        }
    }
    
    // ============ ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ============
    
    selectObject(object) {
        this.clearSelection();
        this.selectedObject = object;
        
        this.highlightBox.setFromObject(object);
        this.highlightBox.visible = true;
        
        if (object.material) {
            if (Array.isArray(object.material)) {
                object.material.forEach(mat => {
                    if (mat.emissive) {
                        mat.emissive.setHex(0x3498db);
                        mat.emissiveIntensity = 0.3;
                    }
                });
            } else if (object.material.emissive) {
                object.material.emissive.setHex(0x3498db);
                object.material.emissiveIntensity = 0.3;
            }
        }
        
        this.showPopup(object);
        this.updateInfoPanel(object);
        this.updateSelectionStatus(true);
    }
    
    clearSelection() {
        if (this.selectedObject && this.selectedObject.userData.originalMaterial) {
            if (Array.isArray(this.selectedObject.material)) {
                this.selectedObject.material = this.selectedObject.userData.originalMaterial;
            } else {
                this.selectedObject.material = this.selectedObject.userData.originalMaterial;
            }
        }
        
        this.selectedObject = null;
        this.highlightBox.visible = false;
        this.updateSelectionStatus(false);
    }
    
    showPopup(object) {
        const popup = document.getElementById('selection-popup');
        const objectName = object.userData.objectName || 'Деталь';
        
        document.getElementById('selected-object-name').textContent = objectName;
        document.getElementById('selected-object-id').textContent = object.id || '-';
        document.getElementById('selected-object-material').textContent = 
            object.material ? object.material.type.replace('Material', '') : '-';
        
        if (object.geometry) {
            const polygonCount = object.geometry.index ? 
                object.geometry.index.count / 3 : 
                object.geometry.attributes.position.count / 3;
            document.getElementById('selected-object-polygons').textContent = 
                Math.round(polygonCount).toLocaleString();
        }
        
        popup.style.display = 'block';
    }
    
    hidePopup() {
        document.getElementById('selection-popup').style.display = 'none';
    }
    
    updateInfoPanel(object) {
        const objectName = object.userData.objectName || 'Деталь';
        const geometry = object.geometry;
        
        document.getElementById('info-object-name').textContent = objectName;
        const paramsList = document.getElementById('info-parameters');
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
                { label: 'ID объекта', value: object.id || '-' },
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
        const statusDot = statusIndicator.querySelector('.status-dot');
        const statusText = statusIndicator.querySelector('span:last-child');
        
        if (isSelected) {
            statusDot.style.backgroundColor = '#2ecc71';
            statusDot.classList.add('active');
            statusText.textContent = 'Выбрано';
        } else {
            statusDot.style.backgroundColor = '#e74c3c';
            statusDot.classList.remove('active');
            statusText.textContent = 'Не выбрано';
        }
    }
    
    selectModel(modelName) {
        this.currentModelName = modelName;
        this.loadModel(modelName);
        this.hidePopup();
        this.clearSelection();
    }
    
    resetCamera() {
        if (this.currentModel) {
            const box = new THREE.Box3().setFromObject(this.currentModel);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            
            const fov = this.camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            cameraZ *= 1.5;
            
            this.camera.position.set(cameraZ, cameraZ, cameraZ);
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
    }
    
    toggleAutoRotate(button) {
        this.autoRotate = !this.autoRotate;
        this.controls.autoRotate = this.autoRotate;
        
        button.classList.toggle('active');
        button.innerHTML = this.autoRotate ? 
            '<i class="fas fa-sync-alt"></i> Вращение' : 
            '<i class="fas fa-ban"></i> Вращение';
    }
    
    toggleGrid(button) {
        this.showGrid = !this.showGrid;
        this.grid.visible = this.showGrid;
        
        button.classList.toggle('active');
        button.innerHTML = this.showGrid ? 
            '<i class="fas fa-th"></i> Сетка' : 
            '<i class="fas fa-th-large"></i> Сетка';
    }
    
    toggleAxes(button) {
        this.showAxes = !this.showAxes;
        this.axes.visible = this.showAxes;
        
        button.classList.toggle('active');
        button.innerHTML = this.showAxes ? 
            '<i class="fas fa-crosshairs"></i> Оси' : 
            '<i class="fas fa-times"></i> Оси';
    }
    
    viewDetails() {
        if (this.selectedObject) {
            const objectName = this.selectedObject.userData.objectName || 'Деталь';
            alert(`Открывается карточка товара: ${objectName}\n\nЗдесь будет полная информация о выбранной детали.`);
        }
    }
    
    addToCart() {
        if (this.selectedObject) {
            const objectName = this.selectedObject.userData.objectName || 'Деталь';
            const modelName = this.getModelDisplayName(this.currentModelName);
            
            const item = {
                id: Date.now(),
                name: objectName,
                model: modelName,
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
                if (scale > 1.1) direction = -0.02;
                if (scale < 0.9) direction = 0.02;
                
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
                `• ${item.name} (${item.model}) - ${item.timestamp}`
            ).join('\n');
            alert(`Товаров в корзине: ${this.cartItems.length}\n\n${itemsList}`);
        }
    }
    
    updateCartDisplay() {
        const cartEmpty = document.getElementById('cart-empty');
        const cartList = document.getElementById('cart-items-list');
        
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
                    <span>${item.model}</span>
                    <small>${item.timestamp}</small>
                `;
                cartList.appendChild(li);
            });
            
            if (this.cartItems.length > 3) {
                const more = document.createElement('li');
                more.textContent = `...и ещё ${this.cartItems.length - 3} товаров`;
                cartList.appendChild(more);
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
        
        this.objects.forEach(object => {
            if (object.geometry) {
                const count = object.geometry.index ? 
                    object.geometry.index.count / 3 : 
                    object.geometry.attributes.position.count / 3;
                totalPolygons += Math.round(count);
            }
        });
        
        this.stats.polygonCount = totalPolygons;
        document.getElementById('polygon-count').textContent = 
            `Полигонов: ${totalPolygons.toLocaleString()}`;
    }
    
    getModelDisplayName(modelName) {
        const names = {
            'cube': 'Куб',
            'gear': 'Шестеренка',
            'bolt': 'Болт М10',
            'bearing': 'Подшипник 6205'
        };
        return names[modelName] || modelName;
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
        console.log('Long press detected');
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
                
                document.getElementById('fps-counter').textContent = `FPS: ${this.stats.fps}`;
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
        
        if (this.highlightBox.visible && this.selectedObject) {
            this.highlightBox.setFromObject(this.selectedObject);
            this.highlightBox.updateMatrixWorld(true);
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
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
    `;
    document.head.appendChild(style);
    
    // Запускаем с небольшой задержкой для стабилизации
    setTimeout(() => {
        const viewer = new ModelViewer();
        window.modelViewer = viewer; // Для отладки в консоли
        console.log('ModelViewer инициализирован');
    }, 100);
});