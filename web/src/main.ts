import './style.css';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// --- Types & Enums ---
export type PlayerType = 'Bounce' | 'Pierce' | 'Split' | 'Heavy' | 'Blast';
export type EnemyType = 'Basic' | 'Shield' | 'Diver' | 'Spawner' | 'Mine';

// --- Image Assets ---
const images: { [key: string]: HTMLImageElement } = {};
function loadImage(key: string, src: string) {
    const img = new Image();
    img.src = src;
    images[key] = img;
}
const playerTypes: PlayerType[] = ['Bounce', 'Pierce', 'Split', 'Heavy', 'Blast'];
playerTypes.forEach(t => loadImage(`player_${t.toLowerCase()}`, `/assets/images/player_${t.toLowerCase()}.png`));
const enemyTypes: EnemyType[] = ['Basic', 'Shield', 'Diver', 'Spawner', 'Mine'];
enemyTypes.forEach(t => loadImage(`enemy_${t.toLowerCase()}`, `/assets/images/enemy_${t.toLowerCase()}.png`));

// --- Game State ---
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragCurrent = { x: 0, y: 0 };
let turn = 1;
let currentStage = 1;
let maxStages = 5; // Area Boss at Stage 5

export type GamePhase = 'StartScreen' | 'StageSelect' | 'Playing' | 'RewardSelect' | 'GameOver';
let currentPhase: GamePhase = 'StartScreen';

// --- Entities ---
class Player {
    x: number;
    y: number;
    radius: number = 12;
    vx: number = 0;
    vy: number = 0;
    speed: number = 0;
    active: boolean = false;

    type: PlayerType;
    damage: number;
    baseSpeed: number;
    hasSplit: boolean = false; // For Split type
    isChild: boolean = false; // Is this a temporary split projectile?

    constructor(x: number, y: number, type: PlayerType = 'Bounce', isChild: boolean = false) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.isChild = isChild;

        switch (type) {
            case 'Pierce':
                this.damage = 2;
                this.baseSpeed = 22;
                break;
            case 'Split':
                this.damage = 1;
                this.baseSpeed = 18;
                break;
            case 'Heavy':
                this.damage = 3;
                this.baseSpeed = 12;
                this.radius = 16;
                break;
            case 'Blast':
                this.damage = 2;
                this.baseSpeed = 16;
                break;
            case 'Bounce':
            default:
                this.damage = 2;
                this.baseSpeed = 18;
                break;
        }

        if (isChild) {
            this.damage = 1;
            this.baseSpeed = 15;
            this.radius = 8;
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        const imgKey = `player_${this.type.toLowerCase()}`;
        const img = images[imgKey];

        if (img && img.complete) {
            ctx.save();
            ctx.translate(this.x, this.y);
            if (this.speed > 0.1) {
                const angle = Math.atan2(this.vy, this.vx);
                ctx.rotate(angle + Math.PI / 2); // 進行方向に向ける
            }
            const size = this.radius * 2.5; // 当たり判定より少し大きめに描画
            ctx.drawImage(img, -size / 2, -size / 2, size, size);
            ctx.restore();
        } else {
            // Fallback
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            switch (this.type) {
                case 'Pierce': ctx.fillStyle = '#9b59b6'; break;
                case 'Split': ctx.fillStyle = '#2ecc71'; break;
                case 'Heavy': ctx.fillStyle = '#f1c40f'; break;
                case 'Blast': ctx.fillStyle = '#e67e22'; break;
                default: ctx.fillStyle = '#3498db'; break;
            }
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.closePath();
        }
    }

    update() {
        if (!this.active) return;

        this.x += this.vx;
        this.y += this.vy;

        // 摩擦（スピード減少） - 摩擦を減らしてバウンド回数を増やす(0.985 -> 0.993)
        this.vx *= 0.993;
        this.vy *= 0.993;
        this.speed = Math.sqrt(this.vx ** 2 + this.vy ** 2);

        // 停止判定
        if (this.speed < 0.5) {
            this.active = false;
            this.vx = 0;
            this.vy = 0;
            onProjectileStop(this);
        }

        // 壁でのバウンド
        if (this.x - this.radius < 0) { this.x = this.radius; this.vx *= -1; }
        if (this.x + this.radius > canvas.width) { this.x = canvas.width - this.radius; this.vx *= -1; }
        if (this.y - this.radius < 0) { this.y = this.radius; this.vy *= -1; }
        if (this.y + this.radius > canvas.height) { this.y = canvas.height - this.radius; this.vy *= -1; }
    }
}

class Enemy {
    x: number;
    y: number;
    width: number = 40;
    height: number = 40;
    hp: number;
    maxHp: number;
    type: EnemyType;

    constructor(x: number, y: number, hp: number, type: EnemyType = 'Basic') {
        this.x = x;
        this.y = y;
        this.hp = hp;
        this.maxHp = hp;
        this.type = type;
    }

    draw(ctx: CanvasRenderingContext2D) {
        const imgKey = `enemy_${this.type.toLowerCase()}`;
        const img = images[imgKey];

        if (img && img.complete) {
            ctx.drawImage(img, this.x, this.y, this.width, this.height);
        } else {
            // Fallback
            ctx.fillStyle = this.getColor();
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.strokeStyle = '#fff';
            if (this.type === 'Shield') {
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y + this.height);
                ctx.lineTo(this.x + this.width, this.y + this.height);
                ctx.strokeStyle = '#bdc3c7';
                ctx.stroke();
            } else {
                ctx.lineWidth = 2;
                ctx.strokeRect(this.x, this.y, this.width, this.height);
            }
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (this.type === 'Diver') ctx.fillText("▼", this.x + this.width / 2, this.y - 10);
            else if (this.type === 'Spawner') ctx.fillText("∞", this.x + this.width / 2, this.y - 10);
            else if (this.type === 'Mine') ctx.fillText("💣", this.x + this.width / 2, this.y - 10);
        }

        // HPバーの描画
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        const barW = this.width;
        const barH = 5;
        const barY = this.y - 8;

        ctx.fillStyle = '#e74c3c'; // 背景（赤）
        ctx.fillRect(this.x, barY, barW, barH);
        ctx.fillStyle = '#2ecc71'; // 現在HP（緑）
        ctx.fillRect(this.x, barY, barW * hpPercent, barH);

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x, barY, barW, barH);
    }

    getColor() {
        switch (this.type) {
            case 'Shield': return '#7f8c8d'; // 灰色
            case 'Diver': return '#c0392b'; // 濃い赤
            case 'Spawner': return '#8e44ad'; // 紫
            case 'Mine': return '#d35400'; // オレンジ
            default: return '#e74c3c'; // 赤
        }
    }
}

// チーム編成（プロトタイプでは手動切り替えテスト用）
let currentPlayerIndex = 0;
let team: Player[] = [
    new Player(canvas.width / 2, canvas.height - 40, 'Bounce'),
    new Player(canvas.width / 2, canvas.height - 40, 'Pierce'),
    new Player(canvas.width / 2, canvas.height - 40, 'Split'),
    new Player(canvas.width / 2, canvas.height - 40, 'Heavy'),
    new Player(canvas.width / 2, canvas.height - 40, 'Blast')
];

let activeProjectiles: Player[] = [];
let enemies: Enemy[] = [];
let explosions: { x: number, y: number, radius: number, alpha: number }[] = [];

// 定期的に敵を生成する
function spawnEnemies(rows: number, startY: number) {
    const types: EnemyType[] = ['Basic', 'Basic', 'Shield', 'Diver', 'Spawner', 'Mine'];

    // ステージが進むほど敵が強くなる、配置確率が上がる
    // 序盤の難易度を緩和 (0.35 -> 0.7)
    const spawnChance = Math.min(0.20 + (currentStage * 0.1), 0.7);

    for (let c = 0; c < 5; c++) {
        for (let r = 0; r < rows; r++) {
            if (Math.random() < spawnChance) {
                // 初期HPを低く抑える (Stage 1はHP 1~2中心)
                const baseHP = Math.floor(turn / 3) + Math.floor(Math.random() * 2) + Math.floor(currentStage / 2);
                const hp = Math.max(1, currentStage === maxStages ? baseHP * 2 : baseHP);

                // 序盤は厄介な敵を出にくくする
                const typeIndex = currentStage === 1 ? 0 : Math.floor(Math.random() * types.length);
                const type = types[typeIndex];

                enemies.push(new Enemy(30 + c * 65, startY + r * 50, hp, type));
            }
        }
    }
}

// 初期敵
spawnEnemies(2, 50);

// --- UI Management ---
const uiLayer = document.getElementById('ui-layer')!;
const screenStart = document.getElementById('screen-start')!;
const screenStage = document.getElementById('screen-stage')!;
const screenReward = document.getElementById('screen-reward')!;
const screenGameOver = document.getElementById('screen-gameover')!;

function setPhase(phase: GamePhase) {
    currentPhase = phase;
    uiLayer.classList.remove('hidden');
    screenStart.classList.add('hidden');
    screenStage.classList.add('hidden');
    screenReward.classList.add('hidden');
    screenGameOver.classList.add('hidden');

    switch (phase) {
        case 'StartScreen':
            screenStart.classList.remove('hidden');
            break;
        case 'StageSelect':
            screenStage.classList.remove('hidden');
            generateStageOptions();
            break;
        case 'Playing':
            uiLayer.classList.add('hidden');
            break;
        case 'RewardSelect':
            screenReward.classList.remove('hidden');
            generateRewardOptions();
            break;
        case 'GameOver':
            screenGameOver.classList.remove('hidden');
            document.getElementById('gameover-stats')!.innerText = `Reached Stage ${currentStage} - Survived ${turn} turns`;
            break;
    }
}

function initRun() {
    team = [new Player(canvas.width / 2, canvas.height - 40, 'Bounce')];
    currentStage = 1;
    turn = 1;
    setPhase('StageSelect');
}

document.getElementById('btn-start')!.addEventListener('click', initRun);
document.getElementById('btn-restart')!.addEventListener('click', initRun);

function startStage() {
    enemies = [];
    explosions = [];
    activeProjectiles = [];
    currentPlayerIndex = 0;

    team.forEach(p => {
        p.x = canvas.width / 2;
        p.y = canvas.height - 40;
        p.vx = 0; p.vy = 0;
        p.active = false;
        p.hasSplit = false;
    });

    // 初期敵配置
    spawnEnemies(currentStage === maxStages ? 4 : 2, 50);
    setPhase('Playing');
}

function generateStageOptions() {
    const container = document.getElementById('stage-options-container')!;
    container.innerHTML = '';

    if (currentStage === maxStages) {
        const option = document.createElement('div');
        option.className = 'card';
        option.innerHTML = `<div class="card-title">Boss Stage (Stage ${currentStage})</div><div class="card-desc">Prepare for a tough fight!</div>`;
        option.addEventListener('click', startStage);
        container.appendChild(option);
        return;
    }

    // ランダムな2つのルートを提示
    for (let i = 0; i < 2; i++) {
        const isElite = Math.random() > 0.7;
        const option = document.createElement('div');
        option.className = 'card';
        option.innerHTML = `
            <div class="card-title">${isElite ? 'Elite Stage ☠️' : 'Normal Stage'} (Stage ${currentStage})</div>
            <div class="card-desc">${isElite ? 'Harder enemies, better chance for rare rewards.' : 'Standard encounter.'}</div>
        `;
        option.addEventListener('click', () => {
            // エリートフラグは今回はオミットしてそのまま開始
            startStage();
        });
        container.appendChild(option);
    }
}

function generateRewardOptions() {
    const container = document.getElementById('reward-options-container')!;
    container.innerHTML = '';

    const types: PlayerType[] = ['Bounce', 'Pierce', 'Split', 'Heavy', 'Blast'];

    // キャラクターの追加を3つ提示
    for (let i = 0; i < 3; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        const option = document.createElement('div');
        option.className = 'card';
        option.innerHTML = `
            <div class="card-title">Add ${type} Character</div>
            <div class="card-desc">Adds a new member to your team.</div>
        `;
        option.addEventListener('click', () => {
            if (team.length < 4) {
                team.push(new Player(canvas.width / 2, canvas.height - 40, type));
            } else {
                // チームが満員なら既存のキャラを上書き（今回は末尾を入れ替え）
                team[team.length - 1] = new Player(canvas.width / 2, canvas.height - 40, type);
            }
            currentStage++;
            setPhase('StageSelect');
        });
        container.appendChild(option);
    }
}

// 起動時の初期化
setPhase('StartScreen');

// --- Game Logic ---
function onProjectileStop(p: Player) {
    if (p.type === 'Blast' && !p.isChild) {
        // 爆発発動
        createExplosion(p.x, p.y, 80, p.damage * 2);
    }

    // 全プロジェクタイルが止まったらターン進行
    if (activeProjectiles.every(proj => !proj.active)) {
        activeProjectiles = []; // 子機などをクリア
        proceedTurn();
    }
}

function proceedTurn() {
    turn++;

    // 敵の行動
    let newEnemies: Enemy[] = [];
    enemies.forEach(e => {
        // ダイバーは2段
        const drop = e.type === 'Diver' ? 80 : 40;
        e.y += drop;

        // スポーナーはターン経過で子分を生成
        if (e.type === 'Spawner' && turn % 3 === 0) {
            newEnemies.push(new Enemy(e.x - 65, e.y, Math.max(1, Math.floor(turn / 2)), 'Basic'));
            newEnemies.push(new Enemy(e.x + 65, e.y, Math.max(1, Math.floor(turn / 2)), 'Basic'));
        }
    });
    enemies.push(...newEnemies);

    // 画面外（左右）に出た敵を削除
    enemies = enemies.filter(e => e.x >= 0 && e.x + e.width <= canvas.width);

    if (turn % 3 === 0) {
        spawnEnemies(1, 10);
    }

    // 次のキャラに交代
    const prevPos = { x: team[currentPlayerIndex].x, y: team[currentPlayerIndex].y };
    currentPlayerIndex = (currentPlayerIndex + 1) % team.length;
    team[currentPlayerIndex].x = prevPos.x;
    team[currentPlayerIndex].y = prevPos.y;
    team[currentPlayerIndex].hasSplit = false; // スプリットフラグ回復

    // ステージクリア判定
    if (enemies.length === 0) {
        if (currentStage === maxStages) {
            // ゲームクリア（仮でリザルトに戻す）
            alert("Game Cleared! You defeated the Boss!");
            setPhase('GameOver');
        } else {
            setPhase('RewardSelect');
        }
    }
}

function createExplosion(x: number, y: number, radius: number, damage: number) {
    explosions.push({ x, y, radius, alpha: 1.0 });
    // 範囲内の敵にダメージ
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        // 簡易的に中心点との距離で判定
        const ex = e.x + e.width / 2;
        const ey = e.y + e.height / 2;
        const dist = Math.sqrt((x - ex) ** 2 + (y - ey) ** 2);
        if (dist <= radius + e.width / 2) {
            damageEnemy(e, i, damage);
        }
    }
}

function damageEnemy(e: Enemy, index: number, damage: number) {
    e.hp -= damage;
    if (e.hp <= 0) {
        enemies.splice(index, 1);
        if (e.type === 'Mine') {
            // 地雷爆発: 全プロジェクタイルの速度を0にする
            activeProjectiles.forEach(p => {
                p.vx = 0;
                p.vy = 0;
            });
            explosions.push({ x: e.x + e.width / 2, y: e.y + e.height / 2, radius: 100, alpha: 0.5 });
        }
    }
}

// --- Input Handling ---
function getMousePos(e: MouseEvent | TouchEvent) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (window.TouchEvent && e instanceof TouchEvent) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
    }

    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

const onPointerDown = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (activeProjectiles.length > 0 || currentPhase !== 'Playing') return;
    isDragging = true;
    dragStart = getMousePos(e);
    dragCurrent = dragStart;
};

const onPointerMove = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (!isDragging) return;
    dragCurrent = getMousePos(e);
};

const onPointerUp = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (!isDragging) return;
    isDragging = false;

    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 10) {
        const p = team[currentPlayerIndex];
        p.vx = (dx / dist) * p.baseSpeed;
        p.vy = (dy / dist) * p.baseSpeed;
        p.active = true;
        activeProjectiles.push(p);
    }
};

canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('touchstart', onPointerDown, { passive: false });
canvas.addEventListener('touchmove', onPointerMove, { passive: false });
window.addEventListener('touchend', onPointerUp, { passive: false });

function checkCollisions() {
    activeProjectiles.forEach(p => {
        if (!p.active) return;

        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];

            let testX = p.x;
            let testY = p.y;

            if (p.x < e.x) testX = e.x;
            else if (p.x > e.x + e.width) testX = e.x + e.width;

            if (p.y < e.y) testY = e.y;
            else if (p.y > e.y + e.height) testY = e.y + e.height;

            let distX = p.x - testX;
            let distY = p.y - testY;
            let distance = Math.sqrt((distX * distX) + (distY * distY));

            if (distance <= p.radius) {
                // 当たり判定処理

                // シールド敵の判定 (下からの攻撃か？)
                let actualDamage = p.damage;
                if (e.type === 'Shield') {
                    // 下面(e.y + e.height)に近いかどうか
                    if (testY >= e.y + e.height - 5 && p.vy < 0) {
                        actualDamage = 1; // シールド効果でダメージ1に軽減
                    }
                }

                damageEnemy(e, i, actualDamage);

                // スプリット特性発動（最初の1回のみ）
                if (p.type === 'Split' && !p.hasSplit && !p.isChild) {
                    p.hasSplit = true;
                    // 左右に子機を射出 (速度ベクトルの垂直方向)
                    const speed = p.baseSpeed * 0.8;
                    // 現在の進行方向の角度
                    const angle = Math.atan2(p.vy, p.vx);

                    const p1 = new Player(p.x, p.y, 'Bounce', true);
                    p1.vx = Math.cos(angle + Math.PI / 2) * speed;
                    p1.vy = Math.sin(angle + Math.PI / 2) * speed;
                    p1.active = true;

                    const p2 = new Player(p.x, p.y, 'Bounce', true);
                    p2.vx = Math.cos(angle - Math.PI / 2) * speed;
                    p2.vy = Math.sin(angle - Math.PI / 2) * speed;
                    p2.active = true;

                    activeProjectiles.push(p1, p2);
                }

                // ヘヴィ特性（ノックバック）
                if (p.type === 'Heavy') {
                    e.y -= 25; // 上に押し戻す
                }

                // 反射処理
                if (p.type === 'Pierce') {
                    // 貫通：減速のみ
                    p.vx *= 0.7;
                    p.vy *= 0.7;
                } else {
                    // 通常反射
                    if (Math.abs(distX) > Math.abs(distY)) {
                        p.vx *= -1;
                    } else {
                        p.vy *= -1;
                    }
                    // めり込み防止
                    p.x += p.vx * 0.5;
                    p.y += p.vy * 0.5;
                }
            }
        }
    });
}

function drawUI() {
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Turn: ${turn}`, 10, 20);
    ctx.fillText(`Enemies: ${enemies.length}`, 10, 40);

    const getTypeName = (type: PlayerType) => {
        switch (type) {
            case 'Bounce': return "Bounce";
            case 'Pierce': return "Pierce (Purple)";
            case 'Split': return "Split (Green)";
            case 'Heavy': return "Heavy (Yellow)";
            case 'Blast': return "Blast (Orange)";
        }
    };

    ctx.fillText(`Current: ${getTypeName(team[currentPlayerIndex].type)}`, 10, 65);

    if (team.length > 1) {
        const next1Idx = (currentPlayerIndex + 1) % team.length;
        ctx.fillStyle = '#aaa';
        ctx.font = '14px sans-serif';
        ctx.fillText(`Next 1: ${getTypeName(team[next1Idx].type)}`, 10, 85);

        if (team.length > 2) {
            const next2Idx = (currentPlayerIndex + 2) % team.length;
            ctx.fillStyle = '#777';
            ctx.fillText(`Next 2: ${getTypeName(team[next2Idx].type)}`, 10, 105);
        }
    }

    // 防衛ラインの描画
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 80);
    ctx.lineTo(canvas.width, canvas.height - 80);
    ctx.stroke();
    ctx.setLineDash([]);
}

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景（常に描画）
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentPhase === 'Playing') {
        activeProjectiles.forEach(p => p.update());
        checkCollisions();

        // 防衛ライン(y = canvas.height - 80)の突破判定
        let breached = false;
        enemies.forEach(e => {
            if (e.y + e.height > canvas.height - 80) {
                breached = true;
            }
        });

        if (breached) {
            setPhase('GameOver');
        }
    }

    // ゲーム描画は Playing 中 または 背景として表示
    enemies.forEach(e => e.draw(ctx));

    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius * (1 - exp.alpha) + 10, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(230, 126, 34, ${exp.alpha})`;
        ctx.fill();
        if (currentPhase === 'Playing') {
            exp.alpha -= 0.05;
            if (exp.alpha <= 0) explosions.splice(i, 1);
        }
    }

    if (currentPhase === 'Playing' || currentPhase === 'RewardSelect' || currentPhase === 'StageSelect') {
        if (activeProjectiles.length === 0 && team.length > 0) {
            team[currentPlayerIndex].draw(ctx);
        } else {
            activeProjectiles.forEach(p => p.draw(ctx));
        }
        drawUI();
    }

    if (isDragging && activeProjectiles.length === 0 && currentPhase === 'Playing') {
        const p = team[currentPlayerIndex];
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        const dx = dragStart.x - dragCurrent.x;
        const dy = dragStart.y - dragCurrent.y;

        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10) {
            const drawLen = 60;
            ctx.lineTo(p.x + (dx / dist) * drawLen, p.y + (dy / dist) * drawLen);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(p.x + (dx / dist) * drawLen, p.y + (dy / dist) * drawLen, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();
        }
    }

    requestAnimationFrame(loop);
}

// Start Game Loop
loop();
