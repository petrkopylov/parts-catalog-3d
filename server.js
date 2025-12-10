const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    console.log(`Запрос: ${req.method} ${req.url}`);
    
    // Базовый путь к файлам
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';
    
    // Определяем MIME-тип
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.glb': 'model/gltf-binary',
        '.gltf': 'model/gltf+json'
    };
    
    contentType = mimeTypes[extname] || 'application/octet-stream';
    
    // Читаем файл
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // Файл не найден
                res.writeHead(404);
                res.end('Файл не найден');
            } else {
                // Другая ошибка сервера
                res.writeHead(500);
                res.end('Ошибка сервера: ' + error.code);
            }
        } else {
            // Успешный ответ
            res.writeHead(200, {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            res.end(content, 'utf-8');
        }
    });
});

const port = 8080;
server.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}/`);
    console.log(`Папка проекта: ${process.cwd()}`);
    console.log('Для мобильного тестирования используйте IP вашего компьютера в локальной сети');
});