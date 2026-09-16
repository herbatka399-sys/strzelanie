const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const healthEl = document.getElementById('health');
const weaponEl = document.getElementById('weapon');
const ammoEl = document.getElementById('ammo');
const messageEl = document.getElementById('message');
const startScreen = document.getElementById('start-screen');
const winScreen = document.getElementById('win-screen');
const gameoverScreen = document.getElementById('gameover-screen');

const TILE = 40;
const MAP_W = 20;
const MAP_H = 20;

let gameRunning = false;
let player, bullets, enemies, crates, obstacles, keys, mouse;
let lastEnemySpawn = 0;
let cameraY = 0;

// Bronie
const weapons = {
    pistol: { name: 'Pistolet', damage: 20, fireRate: 300, bulletSpeed: 12, color: '#ffcc00' },
    shotgun: { name: 'Shotgun', damage: 15, fireRate: 600, bulletSpeed: 10, pellets: 5, color: '#ff6600' },
    rifle: { name: 'Karabin', damage: 35, fireRate: 180, bulletSpeed: 16, color: '#00ccff' },
    smg: { name: 'SMG', damage: 12, fireRate: 100, bulletSpeed: 14, color: '#aa00ff' }
};

function init() {
    player = {
        x: canvas.width / 2,
        y: canvas.height - 100,
        w: 28,
        h: 28,
        speed: 3.2,
        health: 100,
        maxHealth: 100,
        weapon: 'pistol',
        lastShot: 0,
        angle: -Math.PI / 2
    };

    bullets = [];
    enemies = [];
    crates = [];
    obstacles = [];
    keys = {};
    mouse = { x: 0, y: 0, down: false };

    // Generuj mapę - las + przeszkody
    generateMap();

    lastEnemySpawn = Date.now();
    cameraY = 0;
    gameRunning = true;
    startScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    updateUI();
    requestAnimationFrame(loop);
}

function generateMap() {
    // Kłody i drzewa (przeszkody)
    for (let i = 0; i < 45; i++) {
        obstacles.push({
            x: Math.random() * (canvas.width - 50) + 20,
            y: Math.random() * (canvas.height * 3 - 200) + 50,
            w: 30 + Math.random() * 40,
            h: 18 + Math.random() * 15,
            type: Math.random() > 0.5 ? 'log' : 'tree'
        });
    }

    // Skrzynki z bronią
    const weaponKeys = Object.keys(weapons);
    for (let i = 0; i < 8; i++) {
        crates.push({
            x: Math.random() * (canvas.width - 40) + 20,
            y: Math.random() * (canvas.height * 2.5) + 100,
            w: 32,
            h: 32,
            weapon: weaponKeys[Math.floor(Math.random() * weaponKeys.length)],
            taken: false
        });
    }

    // Meta - 5 dziewczyn na końcu
    // (pozostawiamy jako cel, bez dodatkowej logiki)
}

function spawnEnemies() {
    const now = Date.now();
    if (now - lastEnemySpawn < 7000) return;
    lastEnemySpawn = now;

    const count = [1, 1, 1, 3, 3, 5][Math.floor(Math.random() * 6)];
    for (let i = 0; i < count; i++) {
        enemies.push({
            x: Math.random() * (canvas.width - 40) + 20,
            y: cameraY - 50 - Math.random() * 80,
            w: 26,
            h: 26,
            speed: 1.1 + Math.random() * 0.6,
            health: 60,
            maxHealth: 60
        });
    }
}

function update() {
    if (!gameRunning) return;

    // Ruch gracza
    let dx = 0, dy = 0;
    if (keys['w'] || keys['ArrowUp']) dy -= 1;
    if (keys['s'] || keys['ArrowDown']) dy += 1;
    if (keys['a'] || keys['ArrowLeft']) dx -= 1;
    if (keys['d'] || keys['ArrowRight']) dx += 1;

    if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        dx /= len;
        dy /= len;
        const newX = player.x + dx * player.speed;
        const newY = player.y + dy * player.speed;

        if (!collidesWithObstacle(newX, player.y, player.w, player.h)) player.x = newX;
        if (!collidesWithObstacle(player.x, newY, player.w, player.h)) player.y = newY;
    }

    // Granice
    player.x = Math.max(10, Math.min(canvas.width - player.w - 10, player.x));
    player.y = Math.max(cameraY + 20, Math.min(cameraY + canvas.height - 40, player.y));

    // Kamera podąża za graczem w górę
    if (player.y < cameraY + 300) {
        cameraY = player.y - 300;
    }

    // Celowanie
    const worldMouseY = mouse.y + cameraY;
    player.angle = Math.atan2(worldMouseY - (player.y + player.h / 2), mouse.x - (player.x + player.w / 2));

    // Strzał
    if (mouse.down) {
        shoot();
    }

    // Aktualizacja pocisków
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;
        b.life--;

        if (b.life <= 0 || b.x < 0 || b.x > canvas.width || b.y < cameraY - 50 || b.y > cameraY + canvas.height + 50) {
            bullets.splice(i, 1);
            continue;
        }

        // Trafienie w przeciwnika
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (rectCollision(b.x - 3, b.y - 3, 6, 6, e.x, e.y, e.w, e.h)) {
                e.health -= b.damage;
                bullets.splice(i, 1);
                if (e.health <= 0) enemies.splice(j, 1);
                break;
            }
        }
    }

    // Przeciwnicy
    spawnEnemies();
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const angle = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(angle) * e.speed;
        e.y += Math.sin(angle) * e.speed;

        // Kolizja z graczem
        if (rectCollision(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)) {
            player.health -= 0.4;
            if (player.health <= 0) {
                gameOver();
                return;
            }
        }
    }

    // Podnoszenie skrzynek (klawisz E)
    if (keys['e']) {
        for (const c of crates) {
            if (!c.taken && rectCollision(player.x, player.y, player.w, player.h, c.x, c.y, c.w, c.h)) {
                c.taken = true;
                player.weapon = c.weapon;
                messageEl.textContent = `Podniesiono: ${weapons[c.weapon].name}!`;
                setTimeout(() => messageEl.textContent = '', 2000);
                updateUI();
            }
        }
    }

    // Warunek wygranej - dotarcie na sam koniec
    if (player.y < -canvas.height * 2.2) {
        win();
    }

    updateUI();
}

function shoot() {
    const now = Date.now();
    const w = weapons[player.weapon];
    if (now - player.lastShot < w.fireRate) return;
    player.lastShot = now;

    if (w.pellets) {
        // Shotgun
        for (let i = 0; i < w.pellets; i++) {
            const spread = (Math.random() - 0.5) * 0.4;
            bullets.push({
                x: player.x + player.w / 2,
                y: player.y + player.h / 2,
                angle: player.angle + spread,
                speed: w.bulletSpeed,
                damage: w.damage,
                life: 40,
                color: w.color
            });
        }
    } else {
        bullets.push({
            x: player.x + player.w / 2,
            y: player.y + player.h / 2,
            angle: player.angle,
            speed: w.bulletSpeed,
            damage: w.damage,
            life: 50,
            color: w.color
        });
    }
}

function collidesWithObstacle(x, y, w, h) {
    for (const o of obstacles) {
        if (rectCollision(x, y, w, h, o.x, o.y, o.w, o.h)) return true;
    }
    return false;
}

function rectCollision(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Tło lasu
    ctx.fillStyle = '#1e3a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Siatka / trawa
    ctx.strokeStyle = 'rgba(0,80,0,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += TILE) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
    }

    // Przeszkody (kłody i drzewa)
    for (const o of obstacles) {
        const screenY = o.y - cameraY;
        if (screenY < -50 || screenY > canvas.height + 50) continue;

        if (o.type === 'log') {
            ctx.fillStyle = '#5d4037';
            ctx.fillRect(o.x, screenY, o.w, o.h);
            ctx.fillStyle = '#3e2723';
            ctx.fillRect(o.x + 4, screenY + 3, o.w - 8, o.h - 6);
        } else {
            // Drzewo
            ctx.fillStyle = '#2e7d32';
            ctx.beginPath();
            ctx.arc(o.x + o.w / 2, screenY + o.h / 2, o.w / 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#5d4037';
            ctx.fillRect(o.x + o.w / 2 - 4, screenY + o.h / 2, 8, o.h);
        }
    }

    // Skrzynki
    for (const c of crates) {
        if (c.taken) continue;
        const screenY = c.y - cameraY;
        if (screenY < -40 || screenY > canvas.height + 40) continue;

        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(c.x, screenY, c.w, c.h);
        ctx.strokeStyle = '#ffd54f';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x, screenY, c.w, c.h);
        ctx.fillStyle = '#ffd54f';
        ctx.font = '12px Arial';
        ctx.fillText('📦', c.x + 6, screenY + 22);
    }

    // Przeciwnicy (policja)
    for (const e of enemies) {
        const screenY = e.y - cameraY;
        if (screenY < -40 || screenY > canvas.height + 40) continue;

        // Ciało
        ctx.fillStyle = '#1565c0';
        ctx.fillRect(e.x, screenY, e.w, e.h);
        // Głowa
        ctx.fillStyle = '#ffcc80';
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2, screenY - 6, 10, 0, Math.PI * 2);
        ctx.fill();
        // Pasek zdrowia
        ctx.fillStyle = '#333';
        ctx.fillRect(e.x, screenY - 18, e.w, 5);
        ctx.fillStyle = '#f44336';
        ctx.fillRect(e.x, screenY - 18, e.w * (e.health / e.maxHealth), 5);
    }

    // Gracz (Mazurek)
    const pScreenY = player.y - cameraY;
    ctx.save();
    ctx.translate(player.x + player.w / 2, pScreenY + player.h / 2);
    ctx.rotate(player.angle + Math.PI / 2);

    // Marynarka (granatowa w kratkę)
    ctx.fillStyle = '#1a237e';
    ctx.fillRect(-14, -14, 28, 28);
    // Koszula
    ctx.fillStyle = '#e3f2fd';
    ctx.fillRect(-8, -10, 16, 20);
    // Głowa
    ctx.fillStyle = '#ffcc80';
    ctx.beginPath();
    ctx.arc(0, -18, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Pasek życia gracza
    ctx.fillStyle = '#333';
    ctx.fillRect(player.x, pScreenY - 14, player.w, 6);
    ctx.fillStyle = player.health > 40 ? '#4caf50' : '#f44336';
    ctx.fillRect(player.x, pScreenY - 14, player.w * (player.health / player.maxHealth), 6);

    // Pociski
    for (const b of bullets) {
        const screenY = b.y - cameraY;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, screenY, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Meta - 5 dziewczyn na końcu (symbolicznie)
    if (cameraY < -canvas.height * 1.8) {
        ctx.fillStyle = '#ff80ab';
        for (let i = 0; i < 5; i++) {
            const gx = 150 + i * 120;
            const gy = -canvas.height * 2.3 - cameraY;
            ctx.beginPath();
            ctx.arc(gx, gy, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '14px Arial';
            ctx.fillText('👧', gx - 8, gy + 5);
            ctx.fillStyle = '#ff80ab';
        }
        ctx.fillStyle = '#ffd700';
        ctx.font = '20px Arial';
        ctx.fillText('KONIEC LASU - SOKUDO', canvas.width / 2 - 110, -canvas.height * 2.5 - cameraY);
    }
}

function updateUI() {
    healthEl.textContent = Math.max(0, Math.floor(player.health));
    weaponEl.textContent = weapons[player.weapon].name;
    ammoEl.textContent = '∞';
}

function win() {
    gameRunning = false;
    winScreen.classList.remove('hidden');
}

function gameOver() {
    gameRunning = false;
    gameoverScreen.classList.remove('hidden');
}

function loop() {
    if (!gameRunning) return;
    update();
    draw();
    requestAnimationFrame(loop);
}

// Eventy
document.getElementById('startBtn').addEventListener('click', init);
document.getElementById('restartBtn').addEventListener('click', init);
document.getElementById('restartBtn2').addEventListener('click', init);

window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', () => mouse.down = true);
canvas.addEventListener('mouseup', () => mouse.down = false);
canvas.addEventListener('contextmenu', e => e.preventDefault());
