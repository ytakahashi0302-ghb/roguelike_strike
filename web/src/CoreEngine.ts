import { Player, Enemy, PlayerType, EnemyType, UltimateType, ArtifactType, loadImage, images } from './Entities';

export type GamePhase = 'StartScreen' | 'StageSelect' | 'Playing' | 'RewardSelect' | 'ArtifactSelect' | 'GameOver' | 'SkillTree' | 'MapSelect';

export type MapNodeType = 'Battle' | 'Elite' | 'Boss' | 'Shop';

export interface MapNode {
    id: string;
    type: MapNodeType;
    level: number;
    connectedTo: string[]; // IDs of nodes this node can move to
    cleared: boolean;
    x: number;
    y: number;
}

export class GameEngine {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;

    // State
    isDragging = false;
    dragStart = { x: 0, y: 0 };
    dragCurrent = { x: 0, y: 0 };
    turn = 1;
    currentStage = 1;
    maxStages = 5;
    currentWave = 1;
    maxWaves = 3;
    currentPhase: GamePhase = 'StartScreen';
    playAreaHeight = 460;

    // Map System
    mapNodes: MapNode[] = [];
    currentNodeId: string | null = null;

    currentPlayerIndex = 0;
    team: Player[] = [];
    activeProjectiles: Player[] = [];
    enemies: Enemy[] = [];
    explosions: { x: number, y: number, radius: number, alpha: number }[] = [];
    floatingTexts: { x: number, y: number, text: string, alpha: number, vy: number, color: string }[] = [];
    particles: { x: number, y: number, vx: number, vy: number, life: number, maxLife: number, color: string }[] = [];

    screenShake = 0;

    totalCoins = 0;
    bonusDamage = 0;
    initialShield = false;
    hasShield = false; // per-run shield status
    baseCapacity = 1;

    // Ultimate skill state
    selectedUltimate: UltimateType = 'Nuke';
    ultimateCharge = 0;
    maxUltimateCharge = 10;
    ultimateBuffTurns = 0;

    // Artifacts
    currentArtifacts: ArtifactType[] = [];

    // Effects
    ultimateFlashTimer = 0;

    // Callbacks for React
    onStateChange: () => void = () => { };

    private _loopId: number = 0;
    private _handlers: any = {};

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.loadAssets();
        this.initInputHandlers();
    }

    private loadAssets() {
        const playerTypes: PlayerType[] = ['Bounce', 'Pierce', 'Split', 'Heavy', 'Blast'];
        playerTypes.forEach(t => loadImage(`player_${t.toLowerCase()}`, `/assets/images/player_${t.toLowerCase()}.png`));
        const enemyTypes: EnemyType[] = ['Basic', 'Shield', 'Diver', 'Spawner', 'Mine'];
        enemyTypes.forEach(t => loadImage(`enemy_${t.toLowerCase()}`, `/assets/images/enemy_${t.toLowerCase()}.png`));
        loadImage('bg_stage', '/assets/images/bg_stage.png');
    }

    initRun(ultimate: UltimateType = 'Nuke') {
        this.selectedUltimate = ultimate;
        this.ultimateCharge = 0;
        this.ultimateBuffTurns = 0;
        this.currentArtifacts = [];
        this.team = [new Player(this.canvas.width / 2, this.playAreaHeight - 40, 'Bounce')];
        // Apply meta progression
        if (this.baseCapacity > 1) {
            this.team.push(new Player(this.canvas.width / 2, this.playAreaHeight - 40, 'Pierce'));
        }

        // Apply bonus damage to initially created team
        this.team.forEach(p => p.damage += this.bonusDamage);

        this.hasShield = this.initialShield;

        this.currentStage = 1;
        this.turn = 1;
        this.generateMap();
        this.setPhase('MapSelect');
    }

    generateMap() {
        this.mapNodes = [];
        this.currentNodeId = null;
        const levels = this.maxStages;

        let prevLevelIds: string[] = [];
        for (let l = 1; l <= levels; l++) {
            const numNodes = l === levels ? 1 : Math.floor(Math.random() * 2) + 2; // 2 or 3 nodes except for boss
            const currentLevelIds: string[] = [];

            for (let n = 0; n < numNodes; n++) {
                const id = `L${l}_N${n}`;
                let type: MapNodeType = 'Battle';
                if (l === levels) type = 'Boss';
                else if (l % 3 === 0) type = 'Shop'; // Example shop placement
                else if (Math.random() > 0.6) type = 'Elite';

                this.mapNodes.push({
                    id, type, level: l, connectedTo: [], cleared: false,
                    x: this.canvas.width / (numNodes + 1) * (n + 1),
                    y: this.canvas.height - (l * 80)
                });
                currentLevelIds.push(id);

                // Connect from previous level
                if (prevLevelIds.length > 0) {
                    // Simple logic: connect to at least one previous node
                    const parentIdx = Math.floor(n / numNodes * prevLevelIds.length);
                    const parent = this.mapNodes.find(pn => pn.id === prevLevelIds[parentIdx]);
                    if (parent) parent.connectedTo.push(id);
                }
            }
            // Ensure all parents have at least one outgoing connection to avoid dead ends
            prevLevelIds.forEach(pid => {
                const p = this.mapNodes.find(pn => pn.id === pid);
                if (p && p.connectedTo.length === 0) {
                    p.connectedTo.push(currentLevelIds[Math.floor(Math.random() * currentLevelIds.length)]);
                }
            });
            prevLevelIds = currentLevelIds;
        }
    }

    startStage() {
        this.enemies = [];
        this.explosions = [];
        this.floatingTexts = [];
        this.particles = [];
        this.activeProjectiles = [];
        this.currentPlayerIndex = 0;

        this.team.forEach(p => {
            p.x = this.canvas.width / 2;
            p.y = this.playAreaHeight - 40;
            p.vx = 0; p.vy = 0;
            p.active = false;
            p.hasSplit = false;
        });

        this.currentWave = 1;
        this.maxWaves = this.currentStage === this.maxStages ? 5 : 3;
        this.spawnEnemies(2, 50);
        this.setPhase('Playing');
    }

    setPhase(phase: GamePhase) {
        this.currentPhase = phase;
        this.onStateChange();
    }

    // Input handlers
    private getMousePos(e: MouseEvent | TouchEvent) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX, clientY;
        if (window.TouchEvent && e instanceof TouchEvent) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    private initInputHandlers() {
        this._handlers.down = (e: MouseEvent | TouchEvent) => {
            e.preventDefault();
            if (this.activeProjectiles.length > 0 || this.currentPhase !== 'Playing') return;
            const pos = this.getMousePos(e);

            // Check UI interactions
            if (pos.y > this.playAreaHeight) {
                // Ultimate Button Bounds: x:290~380, y: playAreaHeight+20~80
                const btnX = 290;
                if (pos.x > btnX && pos.x < btnX + 90 && pos.y > this.playAreaHeight + 20 && pos.y < this.playAreaHeight + 80) {
                    if (this.ultimateCharge >= this.maxUltimateCharge) {
                        this.useUltimate();
                    }
                }
                return; // Do not start aiming
            }

            this.isDragging = true;
            this.dragStart = pos;
            this.dragCurrent = pos;
        };
        this._handlers.move = (e: MouseEvent | TouchEvent) => {
            e.preventDefault();
            if (!this.isDragging) return;
            this.dragCurrent = this.getMousePos(e);
        };
        this._handlers.up = (e: MouseEvent | TouchEvent) => {
            e.preventDefault();
            if (!this.isDragging) return;
            this.isDragging = false;

            const dx = this.dragStart.x - this.dragCurrent.x;
            const dy = this.dragStart.y - this.dragCurrent.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 10) {
                const p = this.team[this.currentPlayerIndex];
                p.vx = (dx / dist) * p.baseSpeed;
                p.vy = (dy / dist) * p.baseSpeed;
                p.active = true;
                this.activeProjectiles.push(p);
            }
        };

        this.canvas.addEventListener('mousedown', this._handlers.down);
        this.canvas.addEventListener('mousemove', this._handlers.move);
        window.addEventListener('mouseup', this._handlers.up);
        this.canvas.addEventListener('touchstart', this._handlers.down, { passive: false });
        this.canvas.addEventListener('touchmove', this._handlers.move, { passive: false });
        window.addEventListener('touchend', this._handlers.up, { passive: false });
    }

    destroy() {
        cancelAnimationFrame(this._loopId);
        this.canvas.removeEventListener('mousedown', this._handlers.down);
        this.canvas.removeEventListener('mousemove', this._handlers.move);
        window.removeEventListener('mouseup', this._handlers.up);
        this.canvas.removeEventListener('touchstart', this._handlers.down);
        this.canvas.removeEventListener('touchmove', this._handlers.move);
        window.removeEventListener('touchend', this._handlers.up);
    }

    // Game Logic
    spawnEnemies(rows: number, startY: number, forceBoss: boolean = false) {
        if (forceBoss) {
            const boss = new Enemy(this.canvas.width / 2 - 40, startY, 50, 'Boss');
            boss.width = 80;
            boss.height = 80;
            this.enemies.push(boss);
            return;
        }

        const types: EnemyType[] = ['Basic', 'Basic', 'Shield', 'Diver', 'Spawner', 'Mine'];
        const spawnChance = Math.min(0.20 + (this.currentStage * 0.1), 0.7);

        for (let c = 0; c < 5; c++) {
            for (let r = 0; r < rows; r++) {
                if (Math.random() < spawnChance) {
                    const baseHP = Math.floor(this.turn / 3) + Math.floor(Math.random() * 2) + Math.floor(this.currentStage / 2);
                    const hp = Math.max(1, this.currentStage === this.maxStages ? baseHP * 2 : baseHP);
                    const typeIndex = this.currentStage === 1 ? 0 : Math.floor(Math.random() * types.length);
                    this.enemies.push(new Enemy(30 + c * 65, startY + r * 50, hp, types[typeIndex]));
                }
            }
        }
    }

    onProjectileStop = (p: Player) => {
        if (p.type === 'Blast' && !p.isChild) {
            this.createExplosion(p.x, p.y, 80, p.damage * 2);
        }
        if (this.activeProjectiles.every(proj => !proj.active)) {
            this.activeProjectiles = [];
            this.proceedTurn();
        }
    };

    useUltimate() {
        this.ultimateCharge = 0;
        if (this.selectedUltimate === 'Nuke') {
            this.createExplosion(this.canvas.width / 2, this.playAreaHeight / 2, 400, 10);
            this.screenShake = 30; // Huge shake
            this.onStateChange();
        } else if (this.selectedUltimate === 'DoubleDamage') {
            this.ultimateBuffTurns = 1;
            this.onStateChange();
        } else if (this.selectedUltimate === 'Heal') {
            this.hasShield = true;
            this.enemies.forEach(e => e.y -= 100);
            this.screenShake = 15; // Moderate shake
            this.onStateChange();
        }
    }

    proceedTurn() {
        this.turn++;
        if (this.ultimateCharge < this.maxUltimateCharge) {
            this.ultimateCharge++;
        }
        if (this.ultimateBuffTurns > 0) {
            this.ultimateBuffTurns--;
        }
        let newEnemies: Enemy[] = [];
        this.enemies.forEach(e => {
            const drop = e.type === 'Diver' ? 80 : (e.type === 'Boss' ? 20 : 40);
            e.y += drop;
            if (e.type === 'Spawner' && this.turn % 3 === 0) {
                newEnemies.push(new Enemy(e.x - 65, e.y, Math.max(1, Math.floor(this.turn / 2)), 'Basic'));
                newEnemies.push(new Enemy(e.x + 65, e.y, Math.max(1, Math.floor(this.turn / 2)), 'Basic'));
            }
            if (e.type === 'Boss' && this.turn % 4 === 0) {
                // Boss spawns divers
                newEnemies.push(new Enemy(e.x - 60, e.y + 40, 5, 'Diver'));
                newEnemies.push(new Enemy(e.x + 60, e.y + 40, 5, 'Diver'));
                this.screenShake += 10;
            }
        });
        this.enemies.push(...newEnemies);
        this.enemies = this.enemies.filter(e => e.x >= 0 && e.x + e.width <= this.canvas.width);

        // Wave progression logic
        if (this.enemies.length === 0 || this.turn % 5 === 0) {
            if (this.currentWave < this.maxWaves) {
                this.currentWave++;
                this.floatingTexts.push({ x: this.canvas.width / 2 - 50, y: this.playAreaHeight / 2, text: `WAVE ${this.currentWave}`, alpha: 1.0, vy: -1, color: '#f1c40f' });

                // Spawn new wave
                const isFinalBossWave = this.currentWave === this.maxWaves && this.currentStage === this.maxStages;
                this.spawnEnemies(isFinalBossWave ? 1 : 2, 10, isFinalBossWave);
            }
        }

        // Check defense line (Thorns artifact)
        this.enemies.forEach((e, i) => {
            if (e.y + e.height > this.playAreaHeight - 30) {
                if (this.currentArtifacts.includes('Thorns')) {
                    this.damageEnemy(e, i, 1);
                }
            }
        });

        const prevPos = { x: this.team[this.currentPlayerIndex].x, y: this.team[this.currentPlayerIndex].y };
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.team.length;
        this.team[this.currentPlayerIndex].x = prevPos.x;
        this.team[this.currentPlayerIndex].y = prevPos.y;
        this.team[this.currentPlayerIndex].hasSplit = false;

        this.onStateChange();

        if (this.enemies.length === 0 && this.currentWave === this.maxWaves) {
            // Node Cleared!
            const node = this.currentNodeId ? this.mapNodes.find(n => n.id === this.currentNodeId) : undefined;
            if (node) {
                node.cleared = true;
            }

            const coinsEarned = this.turn + (this.currentStage * 10);
            this.totalCoins += coinsEarned;

            if (this.currentStage === this.maxStages) {
                this.setPhase('GameOver');
            } else {
                if (node && node.type === 'Elite') {
                    this.setPhase('ArtifactSelect');
                } else {
                    this.setPhase('RewardSelect');
                }
            }
        }
    }

    createExplosion(x: number, y: number, radius: number, damage: number) {
        this.explosions.push({ x, y, radius, alpha: 1.0 });
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const ex = e.x + e.width / 2;
            const ey = e.y + e.height / 2;
            const dist = Math.sqrt((x - ex) ** 2 + (y - ey) ** 2);
            if (dist <= radius + e.width / 2) {
                this.damageEnemy(e, i, damage);
            }
        }
    }

    damageEnemy(e: Enemy, index: number, damage: number) {
        e.hp -= damage;
        this.floatingTexts.push({ x: e.x + Math.random() * e.width, y: e.y + Math.random() * 20, text: damage.toString(), alpha: 1.0, vy: -1.5, color: '#ff3333' });

        if (damage >= 5) {
            this.screenShake = Math.max(this.screenShake, 10);
        }

        if (e.hp <= 0) {
            this.enemies.splice(index, 1);
            let coins = 2; // Extra coins for kills
            if (this.currentArtifacts.includes('CoinUp')) {
                coins = 3;
            }
            this.totalCoins += coins;
            this.screenShake = Math.max(this.screenShake, 5); // Small shake on kill
            if (e.type === 'Mine') {
                this.activeProjectiles.forEach(p => { p.vx = 0; p.vy = 0; });
                this.explosions.push({ x: e.x + e.width / 2, y: e.y + e.height / 2, radius: 100, alpha: 0.5 });
            }
        }
    }

    checkCollisions() {
        this.activeProjectiles.forEach(p => {
            if (!p.active) return;
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const e = this.enemies[i];
                let testX = p.x; let testY = p.y;
                if (p.x < e.x) testX = e.x; else if (p.x > e.x + e.width) testX = e.x + e.width;
                if (p.y < e.y) testY = e.y; else if (p.y > e.y + e.height) testY = e.y + e.height;
                let distX = p.x - testX; let distY = p.y - testY;
                let distance = Math.sqrt((distX * distX) + (distY * distY));

                if (distance <= p.radius) {
                    let actualDamage = p.damage * (this.ultimateBuffTurns > 0 ? 2 : 1);

                    if (this.currentArtifacts.includes('FirstStrike') && e.hp === e.maxHp) {
                        actualDamage *= 2; // Double damage on full HP enemies
                    }

                    if (e.type === 'Shield') {
                        if (testY >= e.y + e.height - 5 && p.vy < 0) {
                            actualDamage = 1;
                        }
                    }
                    this.damageEnemy(e, i, actualDamage);

                    // Emit hit particles
                    for (let k = 0; k < 5; k++) {
                        this.particles.push({ x: testX, y: testY, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 1.0, maxLife: 1.0, color: '#f39c12' });
                    }

                    if (p.type === 'Split' && !p.hasSplit && !p.isChild) {
                        p.hasSplit = true;
                        const speed = p.baseSpeed * 0.8;
                        const angle = Math.atan2(p.vy, p.vx);
                        const p1 = new Player(p.x, p.y, 'Bounce', true);
                        p1.vx = Math.cos(angle + Math.PI / 2) * speed; p1.vy = Math.sin(angle + Math.PI / 2) * speed;
                        p1.active = true;
                        const p2 = new Player(p.x, p.y, 'Bounce', true);
                        p2.vx = Math.cos(angle - Math.PI / 2) * speed; p2.vy = Math.sin(angle - Math.PI / 2) * speed;
                        p2.active = true;
                        this.activeProjectiles.push(p1, p2);
                    }
                    if (p.type === 'Heavy') e.y -= 25;

                    if (p.type === 'Pierce') {
                        p.vx *= 0.7; p.vy *= 0.7;
                    } else {
                        if (Math.abs(distX) > Math.abs(distY)) p.vx *= -1; else p.vy *= -1;
                        p.x += p.vx * 0.5; p.y += p.vy * 0.5;
                    }

                    // Additional particles for any bounce
                    for (let k = 0; k < 3; k++) {
                        this.particles.push({ x: p.x, y: p.y, vx: p.vx * 0.2 + (Math.random() - 0.5) * 2, vy: p.vy * 0.2 + (Math.random() - 0.5) * 2, life: 0.8, maxLife: 0.8, color: '#3498db' });
                    }
                }
            }
        });
    }

    draw() {
        const { ctx, canvas } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        if (this.screenShake > 0) {
            const dx = (Math.random() - 0.5) * this.screenShake;
            const dy = (Math.random() - 0.5) * this.screenShake;
            ctx.translate(dx, dy);
            this.screenShake *= 0.9;
            if (this.screenShake < 1) this.screenShake = 0;
        }

        const bgImg = images['bg_stage'];
        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
            ctx.drawImage(bgImg, 0, 0, canvas.width, this.playAreaHeight);
        } else {
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, canvas.width, this.playAreaHeight);
        }

        if (this.currentPhase === 'Playing') {
            this.activeProjectiles.forEach(p => p.update(canvas.width, this.playAreaHeight, this.onProjectileStop));
            this.checkCollisions();

            let breached = false;
            this.enemies.forEach(e => {
                if (e.y + e.height > this.playAreaHeight - 40) breached = true;
            });

            if (breached) {
                if (this.hasShield) {
                    this.hasShield = false;
                    // Reset enemies positions or clear them... Let's just push them back
                    this.enemies.forEach(e => e.y -= 100);
                } else {
                    this.setPhase('GameOver');
                }
            }
        }

        this.enemies.forEach(e => e.draw(ctx));

        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const exp = this.explosions[i];
            ctx.beginPath();
            ctx.arc(exp.x, exp.y, exp.radius * (1 - exp.alpha) + 10, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(230, 126, 34, ${exp.alpha})`;
            ctx.fill();
            if (this.currentPhase === 'Playing') {
                exp.alpha -= 0.05;
                if (exp.alpha <= 0) this.explosions.splice(i, 1);
            }
        }

        if (this.currentPhase === 'Playing' || this.currentPhase === 'RewardSelect' || this.currentPhase === 'StageSelect') {

            // Draw particles
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const pt = this.particles[i];
                ctx.globalAlpha = pt.life / pt.maxLife;
                ctx.fillStyle = pt.color;
                ctx.fillRect(pt.x, pt.y, 4, 4);
                ctx.globalAlpha = 1.0;

                if (this.currentPhase === 'Playing') {
                    pt.x += pt.vx;
                    pt.y += pt.vy;
                    pt.life -= 0.05;
                    if (pt.life <= 0) this.particles.splice(i, 1);
                }
            }

            if (this.activeProjectiles.length === 0 && this.team.length > 0) {
                this.team[this.currentPlayerIndex].draw(ctx);
            } else {
                this.activeProjectiles.forEach(p => {
                    // Draw trail
                    if (p.history.length > 0) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        for (let t = 0; t < p.history.length; t++) {
                            ctx.lineTo(p.history[t].x, p.history[t].y);
                        }
                        ctx.strokeStyle = 'rgba(52, 152, 219, 0.3)';
                        ctx.lineWidth = 15;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.stroke();
                    }
                    p.draw(ctx);
                });
            }

            // Draw floating texts
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'center';
            for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
                const ft = this.floatingTexts[i];
                ctx.globalAlpha = ft.alpha;
                ctx.fillStyle = ft.color;
                ctx.fillText(ft.text, ft.x, ft.y);
                ctx.globalAlpha = 1.0;

                if (this.currentPhase === 'Playing') {
                    ft.y += ft.vy;
                    ft.alpha -= 0.02;
                    if (ft.alpha <= 0) this.floatingTexts.splice(i, 1);
                }
            }

            this.drawUI(ctx);
        }

        if (this.isDragging && this.activeProjectiles.length === 0 && this.currentPhase === 'Playing') {
            const p = this.team[this.currentPlayerIndex];
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            const dx = this.dragStart.x - this.dragCurrent.x;
            const dy = this.dragStart.y - this.dragCurrent.y;
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

        if (this.ultimateFlashTimer > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${this.ultimateFlashTimer / 20})`;
            ctx.fillRect(0, 0, this.canvas.width, this.playAreaHeight);
            this.ultimateFlashTimer--;
        }

        ctx.restore(); // Restore after screen shake
    }

    drawUI(ctx: CanvasRenderingContext2D) {
        // UI Dashboard at the bottom
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(0, this.playAreaHeight, this.canvas.width, this.canvas.height - this.playAreaHeight);
        ctx.strokeStyle = '#34495e';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, this.playAreaHeight, this.canvas.width, this.canvas.height - this.playAreaHeight);

        // Status Info (Left - Top Row)
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`ステージ: ${this.currentStage}/${this.maxStages}`, 15, this.playAreaHeight + 15);
        ctx.fillText(`WAVE: ${this.currentWave}/${this.maxWaves}`, 130, this.playAreaHeight + 15);

        // Status Info (Left - Middle Row)
        ctx.fillText(`ターン: ${this.turn}`, 15, this.playAreaHeight + 40);
        ctx.fillStyle = '#f1c40f';
        ctx.fillText(`コイン: ${this.totalCoins}`, 110, this.playAreaHeight + 40);
        ctx.fillStyle = '#fff';
        ctx.fillText(`残敵: ${this.enemies.length}`, 200, this.playAreaHeight + 40);

        // Next Queue (Left - Bottom Row)
        if (this.team.length > 0) {
            ctx.fillStyle = '#fff';
            ctx.font = '14px sans-serif';
            ctx.fillText('現在:', 15, this.playAreaHeight + 75);
            const img0 = images[`player_${this.team[this.currentPlayerIndex].type.toLowerCase()}`];
            if (img0 && img0.complete && img0.naturalWidth > 0) ctx.drawImage(img0, 55, this.playAreaHeight + 65, 36, 36);

            if (this.team.length > 1) {
                const next1Idx = (this.currentPlayerIndex + 1) % this.team.length;
                ctx.fillStyle = '#aaa';
                ctx.fillText('次弾1:', 105, this.playAreaHeight + 75);
                const img1 = images[`player_${this.team[next1Idx].type.toLowerCase()}`];
                if (img1 && img1.complete && img1.naturalWidth > 0) ctx.drawImage(img1, 145, this.playAreaHeight + 68, 30, 30);

                if (this.team.length > 2) {
                    const next2Idx = (this.currentPlayerIndex + 2) % this.team.length;
                    ctx.fillStyle = '#777';
                    ctx.fillText('次弾2:', 190, this.playAreaHeight + 75);
                    const img2 = images[`player_${this.team[next2Idx].type.toLowerCase()}`];
                    if (img2 && img2.complete && img2.naturalWidth > 0) ctx.drawImage(img2, 230, this.playAreaHeight + 68, 30, 30);
                }
            }
        }

        // Ultimate Skill Button (Right side, spanning height)
        const btnX = 290;
        const btnY = this.playAreaHeight + 20;
        const btnW = 90;
        const btnH = 60;

        ctx.fillStyle = this.ultimateCharge >= this.maxUltimateCharge ? '#e74c3c' : '#555';
        ctx.fillRect(btnX, btnY, btnW, btnH);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('必殺技', btnX + btnW / 2, btnY + btnH / 2 - 5);
        ctx.font = '12px sans-serif';
        ctx.fillText(`${this.ultimateCharge}/${this.maxUltimateCharge}`, btnX + btnW / 2, btnY + btnH / 2 + 10);
        if (this.ultimateBuffTurns > 0) {
            ctx.fillStyle = '#e74c3c';
            ctx.fillText('バフ発動中!', btnX + btnW / 2, btnY - 5);
        }

        // Defense Line
        ctx.strokeStyle = this.hasShield ? 'rgba(100, 255, 100, 0.8)' : 'rgba(255, 100, 100, 0.5)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, this.playAreaHeight - 30);
        ctx.lineTo(this.canvas.width, this.playAreaHeight - 30);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore(); // Restore from screen shake
    }

    startLoop() {
        const tick = () => {
            this.draw();
            this._loopId = requestAnimationFrame(tick);
        };
        tick();
    }
}
