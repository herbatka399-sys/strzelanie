const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const healthFill = document.getElementById('health-fill');
const weaponEl = document.getElementById('weapon');
const messageEl = document.getElementById('message');
const startScreen = document.getElementById('start-screen');
const winScreen = document.getElementById('win-screen');
const gameoverScreen = document.getElementById('gameover-screen');

const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');
const shootBtn = document.getElementById('shoot-btn');

let W, H;
let gameRunning = false;
let player, bullets, enemies, crates, obstacles;
let lastEnemySpawn = 0;
let cameraY = 0;
let keys = {};
let mouse = { x: 0, y: 0, down: false };
let joystick = { active: false, dx: 0, dy: 0 };
let isMobile = false;

// Bronie
const weapons = {
    pistol:  { name: 'Pistolet',  damage: 22, fireRate: 280, speed: 13, color: '#ffcc00' },
    shotgun: { name: 'Shotgun',   damage: 14, fireRate: 550, speed: 11, pellets: 6, color: '#ff7043' },
    rifle:   { name: 'Karabin',   damage: 38, fireRate: 160, speed: 17, color: '#29b6f6' },
    smg:     { name: 'SMG',       damage: 13, fireRate: 90,  speed: 15, color: '#ab47bc' }
};

function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    isMobile = window.matchMedia('(pointer: coarse)').matches || W < 900;
}

window.addEventListener('resize', resize);
resize();

function init() {
    player = {
        x: W / 2,
        y: H * 0.7,
        w: 32,
        h: 32,
        speed: 3.8,
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
    mouse.down = false;
    joystick = { active: false, dx: 0, dy: 0 };
    cameraY = 0;
    lastEnemySpawn = Date.now();

    generateWorld();
    gameRunning = true;

    startScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    updateUI();
    requestAnimationFrame(loop);
}

function generateWorld() {
    // Drzewa i kłody
    for (let i = 0; i < 70; i++) {
        const type = Math.random() > 0.55 ? 'tree' : 'log';
        obstacles.push({
            x: Math.random() * (W - 60) + 30,
            y: Math.random() * (H * 4) + 80,
            w: type === 'tree' ? 36 + Math.random() * 20 : 45 + Math.random() * 35,
            h: type === 'tree' ? 36 + Math.random() * 20 : 16 + Math.random() * 10,
            type
        });
    }

    // Skrzynki
    const names = Object.keys(weapons);
    for (let i = 0; i < 10; i++) {
        crates.push({
            x: Math.random() * (W - 50) + 25,
            y: Math.random() * (H * 3.2) + 150,
            w: 36,
            h: 36,
            weapon: names[Math.floor(Math.random() * names.length)],
            taken: false
        });
    }
}

function spawnEnemies() {
    const now = Date.now();
    if (now - lastEnemySpawn < 7000) return;
    lastEnemySpawn = now;

    const countOptions = [1, 1, 1, 2, 3, 3, 5];
    const count = countOptions[Math.floor(Math.random() * countOptions.length)];

    for (let i = 0; i < count; i++) {
        enemies.push({
            x: Math.random() * (W - 50) + 25,
            y: cameraY - 60 - Math.random() * 100,
            w: 28,
            h: 28,
            speed: 1.15 + Math.random() * 0.7,
            health: 55 + Math.random() * 25,
            maxHealth: 80
        });
    }
}

function update(dt) {
    if (!gameRunning) return;

    // Ruch
    let dx = 0, dy = 0;

    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;

    // Joystick
    if (joystick.active) {
        dx += joystick.dx;
        dy += joystick.dy;
    }

    if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;

        const nx = player.x + dx * player.speed;
        const ny = player.y + dy * player.speed;

        if (!collidesObstacle(nx, player.y, player.w, player.h)) player.x = nx;
        if (!collidesObstacle(player.x, ny, player.w, player.h)) player.y = ny;
    }

    // Granice
    player.x = Math.max(16, Math.min(W - player.w - 16, player.x));
    player.y = Math.max(cameraY + 30, Math.min(cameraY + H - 50, player.y));

    // Kamera
    const targetCam = player.y - H * 0.55;
    cameraY += (targetCam - cameraY) * 0.08;

    // Celowanie (mysz / środek ekranu na mobile gdy nie celujemy)
    if (!isMobile || mouse.down) {
        const worldMouseY = mouse.y + cameraY;
        player.angle = Math.atan2(worldMouseY - (player.y + player.h / 2), mouse.x - (player.x + player.w / 2));
    }

    // Strzał
    if (mouse.down || (isMobile && shootBtn.classList.contains('active'))) {
        shoot();
    }

    // Pociski
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;
        b.life--;

        if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < cameraY - 80 || b.y > cameraY + H + 80) {
            bullets.splice(i, 1);
            continue;
        }

        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (rectHit(b.x - 4, b.y - 4, 8, 8, e.x, e.y, e.w, e.h)) {
                e.health -= b.damage;
                bullets.splice(i, 1);
                if (e.health <= 0) enemies.splice(j, 1);
                break;
            }
        }
    }

    // Przeciwnicy
    spawnEnemies();
    for (const e of enemies) {
        const ang = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(ang) * e.speed;
        e.y += Math.sin(ang) * e.speed;

        if (rectHit(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)) {
            player.health -= 0.35;
            if (player.health <= 0) {
                gameOver();
                return;
            }
        }
    }

    // Podnoszenie skrzynek (E lub automatycznie przy dotknięciu)
    for (const c of crates) {
        if (!c.taken && rectHit(player.x, player.y, player.w, player.h, c.x, c.y, c.w, c.h)) {
            c.taken = true;
            player.weapon = c.weapon;
            showMessage(`Podniesiono: ${weapons[c.weapon].name}`);
            updateUI();
        }
    }

    // Wygrana
    if (player.y < -H * 2.8) {
        win();
    }

    updateUI();
}

function shoot() {
    const now = Date.now();
    const w = weapons[player.weapon];
    if (now - player.lastShot < w.fireRate) return;
    player.lastShot = now;

    const baseAngle = player.angle;

    if (w.pellets) {
        for (let i = 0; i < w.pellets; i++) {
            const spread = (Math.random() - 0.5) * 0.45;
            bullets.push({
                x: player.x + player.w / 2,
                y: player.y + player.h / 2,
                angle: baseAngle + spread,
                speed: w.speed,
                damage: w.damage,
                life: 45,
                color: w.color
            });
        }
    } else {
        bullets.push({
            x: player.x + player.w / 2,
            y: player.y + player.h / 2,
            angle: baseAngle,
            speed: w.speed,
            damage: w.damage,
            life: 55,
            color: w.color
        });
    }
}

function collidesObstacle(x, y, w, h) {
    for (const o of obstacles) {
        if (rectHit(x, y, w, h, o.x, o.y, o.w, o.h)) return true;
    }
    return false;
}

function rectHit(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

function showMessage(txt) {
    messageEl.textContent = txt;
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => messageEl.textContent = '', 2200);
}

function draw() {
    // Tło
    ctx.fillStyle = '#142414';
    ctx.fillRect(0, 0, W, H);

    // Lekki gradient lasu
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0d1f0d');
    grad.addColorStop(1, '#1a3320');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Przeszkody
    for (const o of obstacles) {
        const sy = o.y - cameraY;
        if (sy < -60 || sy > H + 60) continue;

        if (o.type === 'log') {
            // Kłoda
            ctx.fillStyle = '#4e342e';
            ctx.beginPath();
            ctx.roundRect(o.x, sy, o.w, o.h, 6);
            ctx.fill();
            ctx.fillStyle = '#3e2723';
            ctx.fillRect(o.x + 5, sy + 4, o.w - 10, o.h - 8);
        } else {
            // Drzewo
            ctx.fillStyle = '#1b5e20';
            ctx.beginPath();
            ctx.arc(o.x + o.w / 2, sy + o.h / 2 - 8, o.w * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#33691e';
            ctx.beginPath();
            ctx.arc(o.x + o.w / 2 - 6, sy + o.h / 2 - 14, o.w * 0.45, 0, Math.PI * 2);
            ctx.fill();
            // Pień
            ctx.fillStyle = '#5d4037';
            ctx.fillRect(o.x + o.w / 2 - 5, sy + o.h / 2, 10, o.h * 0.7);
        }
    }

    // Skrzynki
    for (const c of crates) {
        if (c.taken) continue;
        const sy = c.y - cameraY;
        if (sy < -40 || sy > H + 40) continue;

        ctx.fillStyle = '#6d4c41';
        ctx.beginPath();
        ctx.roundRect(c.x, sy, c.w, c.h, 4);
        ctx.fill();
        ctx.strokeStyle = '#ffc107';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '20px serif';
        ctx.fillText('📦', c.x + 6, sy + 26);
    }

    // Przeciwnicy (policja)
    for (const e of enemies) {
        const sy = e.y - cameraY;
        if (sy < -50 || sy > H + 50) continue;

        // Cień
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(e.x + e.w / 2, sy + e.h + 4, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Mundur
        ctx.fillStyle = '#0d47a1';
        ctx.fillRect(e.x, sy, e.w, e.h);
        // Głowa
        ctx.fillStyle = '#ffcc80';
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2, sy - 7, 11, 0, Math.PI * 2);
        ctx.fill();
        // Czapka
        ctx.fillStyle = '#1565c0';
        ctx.fillRect(e.x + 2, sy - 16, e.w - 4, 8);

        // Pasek HP
        ctx.fillStyle = '#222';
        ctx.fillRect(e.x, sy - 24, e.w, 5);
        ctx.fillStyle = '#ef5350';
        ctx.fillRect(e.x, sy - 24, e.w * Math.max(0, e.health / e.maxHealth), 5);
    }

    // Gracz – Mazurek
    const psy = player.y - cameraY;

    // Cień
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(player.x + player.w / 2, psy + player.h + 5, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(player.x + player.w / 2, psy + player.h / 2);
    ctx.rotate(player.angle + Math.PI / 2);

    // Marynarka (granatowa)
    ctx.fillStyle = '#1a237e';
    ctx.fillRect(-15, -16, 30, 32);
    // Kratka
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    for (let i = -12; i < 15; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, -16);
        ctx.lineTo(i, 16);
        ctx.stroke();
    }

    // Koszula
    ctx.fillStyle = '#e3f2fd';
    ctx.fillRect(-9, -12, 18, 24);

    // Głowa
    ctx.fillStyle = '#ffcc80';
    ctx.beginPath();
    ctx.arc(0, -20, 12, 0, Math.PI * 2);
    ctx.fill();

    // Broda
    ctx.fillStyle = '#5d4037';
    ctx.beginPath();
    ctx.ellipse(0, -14, 8, 5, 0, 0, Math.PI);
    ctx.fill();

    ctx.restore();

    // Pasek życia nad graczem
    ctx.fillStyle = '#222';
    ctx.fillRect(player.x - 4, psy - 18, player.w + 8, 7);
    ctx.fillStyle = player.health > 35 ? '#66bb6a' : '#ef5350';
    ctx.fillRect(player.x - 4, psy - 18, (player.w + 8) * (player.health / player.maxHealth), 7);

    // Pociski
    for (const b of bullets) {
        const sy = b.y - cameraY;
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(b.x, sy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Meta – koniec lasu
    if (cameraY < -H * 2.2) {
        const metaY = -H * 2.7 - cameraY;

        ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
        ctx.fillRect(0, metaY - 40, W, 120);

        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('KONIEC LASU', W / 2, metaY - 10);

        // 5 dziewczyn
        for (let i = 0; i < 5; i++) {
            const gx = W * 0.15 + i * (W * 0.17);
            ctx.font = '36px serif';
            ctx.fillText('👧', gx, metaY + 40);
        }
        ctx.textAlign = 'left';
    }
}

function updateUI() {
    const pct = Math.max(0, player.health / player.maxHealth * 100);
    healthFill.style.width = pct + '%';
    weaponEl.textContent = weapons[player.weapon].name;
}

function win() {
    gameRunning = false;
    winScreen.classList.remove('hidden');
}

function gameOver() {
    gameRunning = false;
    gameoverScreen.classList.remove('hidden');
}

let lastTime = 0;
function loop(timestamp) {
    if (!gameRunning) return;
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    update(dt);
    draw();
    requestAnimationFrame(loop);
}

// ===== Eventy =====
document.getElementById('startBtn').addEventListener('click', init);
document.getElementById('restartBtn').addEventListener('click', init);
document.getElementById('restartBtn2').addEventListener('click', init);

// Klawiatura
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
});

// Mysz (desktop)
canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', () => mouse.down = true);
canvas.addEventListener('mouseup', () => mouse.down = false);
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ===== Joystick =====
function handleJoystick(e, isStart) {
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    const rect = joystickBase.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (isStart) {
        joystick.active = true;
    }

    if (!joystick.active) return;

    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const maxDist = 45;
    const dist = Math.hypot(dx, dy);

    if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
    }

    joystick.dx = dx / maxDist;
    joystick.dy = dy / maxDist;

    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

function endJoystick() {
    joystick.active = false;
    joystick.dx = 0;
    joystick.dy = 0;
    joystickKnob.style.transform = 'translate(-50%, -50%)';
}

joystickBase.addEventListener('touchstart', e => handleJoystick(e, true), { passive: false });
joystickBase.addEventListener('touchmove', e => handleJoystick(e, false), { passive: false });
joystickBase.addEventListener('touchend', endJoystick);
joystickBase.addEventListener('touchcancel', endJoystick);

// Przycisk strzału
shootBtn.addEventListener('touchstart', e => {
    e.preventDefault();
    shootBtn.classList.add('active');
    mouse.down = true;
}, { passive: false });

shootBtn.addEventListener('touchend', () => {
    shootBtn.classList.remove('active');
    mouse.down = false;
});
shootBtn.addEventListener('touchcancel', () => {
    shootBtn.classList.remove('active');
    mouse.down = false;
});

// Desktop też może klikać strzał
shootBtn.addEventListener('mousedown', () => {
    shootBtn.classList.add('active');
    mouse.down = true;
});
shootBtn.addEventListener('mouseup', () => {
    shootBtn.classList.remove('active');
    mouse.down = false;
});
