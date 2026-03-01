export type PlayerType = 'Bounce' | 'Pierce' | 'Split' | 'Heavy' | 'Blast';
export type EnemyType = 'Basic' | 'Shield' | 'Diver' | 'Spawner' | 'Mine';
export type UltimateType = 'Nuke' | 'DoubleDamage' | 'Heal';

export const images: { [key: string]: HTMLImageElement } = {};
export function loadImage(key: string, src: string) {
    const img = new Image();
    img.src = src;
    images[key] = img;
}

export class Player {
    x: number;
    y: number;
    radius: number = 32;
    vx: number = 0;
    vy: number = 0;
    speed: number = 0;
    active: boolean = false;

    type: PlayerType;
    damage: number;
    baseSpeed: number;
    hasSplit: boolean = false;
    isChild: boolean = false;

    constructor(x: number, y: number, type: PlayerType = 'Bounce', isChild: boolean = false) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.isChild = isChild;

        switch (type) {
            case 'Pierce': this.damage = 2; this.baseSpeed = 22; break;
            case 'Split': this.damage = 1; this.baseSpeed = 18; break;
            case 'Heavy': this.damage = 3; this.baseSpeed = 12; break;
            case 'Blast': this.damage = 2; this.baseSpeed = 16; break;
            case 'Bounce':
            default: this.damage = 2; this.baseSpeed = 18; break;
        }

        if (isChild) {
            this.damage = 1;
            this.baseSpeed = 15;
            this.radius = 16;
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        const imgKey = `player_${this.type.toLowerCase()}`;
        const img = images[imgKey];

        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(this.x, this.y);
            if (this.speed > 0.1) {
                const angle = Math.atan2(this.vy, this.vx);
                ctx.rotate(angle + Math.PI / 2);
            }
            const size = this.radius * 2.5;
            ctx.drawImage(img, -size / 2, -size / 2, size, size);
            ctx.restore();
        } else {
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

    update(canvasWidth: number, canvasHeight: number, onStop: (p: Player) => void) {
        if (!this.active) return;
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.993;
        this.vy *= 0.993;
        this.speed = Math.sqrt(this.vx ** 2 + this.vy ** 2);

        if (this.speed < 0.5) {
            this.active = false;
            this.vx = 0;
            this.vy = 0;
            onStop(this);
        }

        if (this.x - this.radius < 0) { this.x = this.radius; this.vx *= -1; }
        if (this.x + this.radius > canvasWidth) { this.x = canvasWidth - this.radius; this.vx *= -1; }
        if (this.y - this.radius < 0) { this.y = this.radius; this.vy *= -1; }
        if (this.y + this.radius > canvasHeight) { this.y = canvasHeight - this.radius; this.vy *= -1; }
    }
}

export class Enemy {
    x: number;
    y: number;
    width: number = 64;
    height: number = 64;
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

        if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, this.x, this.y, this.width, this.height);
        } else {
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

        const hpPercent = Math.max(0, this.hp / this.maxHp);
        const barW = this.width;
        const barH = 5;
        const barY = this.y - 8;

        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(this.x, barY, barW, barH);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(this.x, barY, barW * hpPercent, barH);

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x, barY, barW, barH);
    }

    getColor() {
        switch (this.type) {
            case 'Shield': return '#7f8c8d';
            case 'Diver': return '#c0392b';
            case 'Spawner': return '#8e44ad';
            case 'Mine': return '#d35400';
            default: return '#e74c3c';
        }
    }
}
