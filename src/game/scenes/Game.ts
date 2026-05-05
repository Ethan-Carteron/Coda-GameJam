import * as Phaser from 'phaser';
import { Socket } from 'socket.io-client';
import { processHit, processStarCollection, GameState, INITIAL_HEALTH } from '../logic';

interface PlayerData {
    id: string;
    name: string;
    isHost: boolean;
}

export class Game extends Phaser.Scene {
    private socket: Socket;
    private roomCode: string;
    private isHost: boolean = false;
    private playerName: string;

    private player: Phaser.Physics.Arcade.Sprite;
    private players: Map<string, { 
        sprite: Phaser.Physics.Arcade.Sprite, 
        nameTag: Phaser.GameObjects.Text,
        hearts: Phaser.GameObjects.Graphics,
        health: number,
        isImmune: boolean
    }> = new Map();

    private stars: Phaser.Physics.Arcade.Group;
    private bombs: Phaser.Physics.Arcade.Group;
    private platforms: Phaser.Physics.Arcade.StaticGroup;
    private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    
    private gameState: GameState = {
        health: INITIAL_HEALTH, isImmune: false, score: 0, isSpectator: false, gameOver: false, activeTint: null
    };

    private scoreText: Phaser.GameObjects.Text;
    private canDash = true;
    private isDashing = false;
    private playerHearts: Phaser.GameObjects.Graphics;
    private playerNameTag: Phaser.GameObjects.Text;
    private bots: any[] = [];
    
    private pendingStarCollections: Set<number> = new Set();

    constructor() {
        super('Game');
    }

    init(data: { socket: Socket, roomCode: string }) {
        this.socket = data.socket;
        this.roomCode = data.roomCode;
        this.gameState = { health: INITIAL_HEALTH, isImmune: false, score: 0, isSpectator: false, gameOver: false, activeTint: null };
        this.pendingStarCollections.clear();
    }

    preload() {
        this.load.setPath('assets');
        this.load.image('sky', 'sky.png');
        this.load.image('ground', 'platform.png');
        this.load.image('star', 'star.png');
        this.load.image('bomb', 'bomb.png');
        this.load.spritesheet('dude', 'dude.png', { frameWidth: 32, frameHeight: 48 });
    }

    create() {
        this.add.image(400, 300, 'sky');
        this.platforms = this.physics.add.staticGroup();
        this.stars = this.physics.add.group();
        this.bombs = this.physics.add.group();

        this.setupPlatforms();
        this.setupPlayer();
        this.setupPhysics();
        this.setupUI();
        this.setupSocketListeners();

        this.cursors = this.input.keyboard!.createCursorKeys();

        if (!this.anims.exists('left')) {
            this.anims.create({ key: 'left', frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
            this.anims.create({ key: 'turn', frames: [ { key: 'dude', frame: 4 } ], frameRate: 20 });
            this.anims.create({ key: 'right', frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }), frameRate: 10, repeat: -1 });
        }
    }

    setupPlatforms() {
        this.platforms.create(400, 568, 'ground').setScale(3).refreshBody();
        this.platforms.create(600, 400, 'ground');
        this.platforms.create(50, 250, 'ground');
        this.platforms.create(750, 220, 'ground');
    }

    setupPlayer() {
        this.player = this.physics.add.sprite(100, 450, 'dude');
        this.player.setBounce(0.2);
        this.player.setCollideWorldBounds(true);
        this.playerNameTag = this.add.text(0, 0, '', { fontSize: '14px', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
        this.playerHearts = this.add.graphics();
    }

    setupPhysics() {
        this.physics.add.collider(this.player, this.platforms);
        this.physics.add.collider(this.stars, this.platforms);
        this.physics.add.collider(this.bombs, this.platforms);
        this.physics.add.collider(this.player, this.bombs, this.hitBomb, undefined, this);
    }

    setupUI() {
        this.scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '32px', color: '#fff', stroke: '#000', strokeThickness: 4 });
    }

    setupSocketListeners() {
        this.socket.off('roomInfo');
        this.socket.off('playerJoined');
        this.socket.off('playerLeft');
        this.socket.off('playerMoved');
        this.socket.off('gameStateSync');
        this.socket.off('collectStarAt');
        this.socket.off('botSpawned');
        this.socket.off('hostLeft');

        this.socket.emit('getRoomInfo', this.roomCode);
        this.socket.on('roomInfo', (room) => {
            this.isHost = room.hostId === this.socket.id;
            const me = room.players.find((p: any) => p.id === this.socket.id);
            this.playerName = me ? me.name : 'Joueur';
            this.playerNameTag.setText(this.playerName);
            room.players.forEach((p: any) => { if (p.id !== this.socket.id) this.addRemotePlayer(p); });
            if (this.isHost && this.stars.countActive(true) === 0) this.spawnStars();
        });

        this.socket.on('playerJoined', (p) => this.addRemotePlayer(p));
        this.socket.on('playerLeft', (id) => this.removeRemotePlayer(id));
        this.socket.on('playerMoved', (data) => this.updateRemotePlayer(data));
        this.socket.on('gameStateSync', (data) => this.syncGameState(data));
        this.socket.on('botSpawned', (data) => this.spawnBot(data.id));
        
        this.socket.on('collectStarAt', (starIndex: number) => {
            if (this.isHost) {
                const star = this.stars.getChildren()[starIndex] as Phaser.Physics.Arcade.Sprite;
                if (star) this.collectStar(null, star);
            }
        });

        this.socket.on('hostLeft', () => { alert("L'hôte a quitté."); window.location.reload(); });
    }

    addRemotePlayer(p: PlayerData) {
        if (this.players.has(p.id)) return;
        const sprite = this.physics.add.sprite(100, 450, 'dude');
        sprite.setImmovable(true);
        (sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        const nameTag = this.add.text(0, 0, p.name, { fontSize: '14px', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
        const hearts = this.add.graphics();
        this.players.set(p.id, { sprite, nameTag, hearts, health: INITIAL_HEALTH, isImmune: false });
    }

    removeRemotePlayer(id: string) {
        const p = this.players.get(id);
        if (p) { p.sprite.destroy(); p.nameTag.destroy(); p.hearts.destroy(); this.players.delete(id); }
    }

    updateRemotePlayer(data: any) {
        const p = this.players.get(data.id);
        if (p) {
            if (data.health <= 0 && p.health > 0) {
                this.showDeathMessage(p.nameTag.text, data.x, data.y);
            }

            p.health = data.health;
            if (p.health <= 0) {
                p.sprite.setVisible(false); p.nameTag.setVisible(false); p.hearts.clear();
                return;
            }

            if (data.isImmune && !p.isImmune) {
                this.applyColorFilter(p.sprite, 0xff0000);
            }
            p.isImmune = data.isImmune;

            p.sprite.setVisible(true).setPosition(data.x, data.y).setFlipX(data.flipX);
            if (data.anim) p.sprite.anims.play(data.anim, true);
            this.drawHearts(p.hearts, data.x, data.y - 40, data.health);
            p.nameTag.setVisible(true).setPosition(data.x, data.y - 55);
            p.sprite.setAlpha(data.isImmune ? (0.5 + Math.sin(this.time.now / 100) * 0.5) : 1);
        }
    }

    syncGameState(data: any) {
        if (this.isHost) return;
        this.gameState.score = data.score;
        this.scoreText.setText('Score: ' + this.gameState.score);
        const currentStars = this.stars.getChildren();
        data.stars.forEach((s: any, index: number) => {
            let star = currentStars[index] as Phaser.Physics.Arcade.Sprite;
            if (!star) star = this.stars.create(s.x, s.y, 'star');
            
            // Client: don't reactivate star if we just collected it and waiting for host confirmation
            if (this.pendingStarCollections.has(index)) {
                star.disableBody(true, true);
                return;
            }

            if (s.active) {
                star.enableBody(true, s.x, s.y, true, true);
            } else {
                star.disableBody(true, true);
            }
        });
        const currentBombs = this.bombs.getChildren();
        data.bombs.forEach((b: any, index: number) => {
            let bomb = currentBombs[index] as Phaser.Physics.Arcade.Sprite;
            if (!bomb) bomb = this.bombs.create(b.x, b.y, 'bomb');
            bomb.enableBody(true, b.x, b.y, true, true);
            bomb.setBounce(1).setVelocity(b.vx, b.vy);
        });
    }

    update() {
        if (this.gameState.gameOver) return;
        
        // Host: always emit update even if dead
        if (this.isHost) this.emitHostUpdate();

        if (!this.gameState.isSpectator) {
            this.handleInput();
            this.updateUI();
            this.checkStarsDistance();
        }

        this.updateBots();
        this.emitUpdate();
    }

    checkStarsDistance() {
        this.stars.getChildren().forEach((star: any) => {
            if (star.active && star.visible) {
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, star.x, star.y);
                if (dist < 30) this.collectStar(this.player, star);
            }
        });
    }

    spawnBot(id: string) {
        const botSprite = this.physics.add.sprite(Phaser.Math.Between(100, 700), 450, 'dude');
        botSprite.setBounce(0.2).setCollideWorldBounds(true);
        this.physics.add.collider(botSprite, this.platforms);
        
        const botName = this.add.text(0, 0, 'BOT_' + id.substr(4), { fontSize: '12px', color: '#0f0' }).setOrigin(0.5);
        const botHearts = this.add.graphics();
        
        this.bots.push({ sprite: botSprite, nameTag: botName, hearts: botHearts, health: 3, nextJump: 0 });
    }

    updateBots() {
        this.bots.forEach(bot => {
            if (bot.health <= 0) return;

            if (this.time.now > bot.nextJump && bot.sprite.body.blocked.down) {
                bot.sprite.setVelocityY(-330); bot.nextJump = this.time.now + Phaser.Math.Between(1000, 3000);
            }
            bot.sprite.setVelocityX(Math.sin(this.time.now / 500) * 160);
            bot.sprite.anims.play(bot.sprite.body.velocity.x < 0 ? 'left' : 'right', true);
            
            bot.nameTag.setPosition(bot.sprite.x, bot.sprite.y - 55);
            this.drawHearts(bot.hearts, bot.sprite.x, bot.sprite.y - 40, bot.health);

            this.stars.getChildren().forEach((star: any) => {
                if (star.active && Phaser.Math.Distance.Between(bot.sprite.x, bot.sprite.y, star.x, star.y) < 30) {
                    this.collectStar(bot.sprite, star);
                }
            });

            this.physics.overlap(bot.sprite, this.bombs, () => {
                if (bot.isImmune) return;
                bot.health--;
                this.applyColorFilter(bot.sprite, 0xff0000);
                bot.isImmune = true;
                this.time.delayedCall(1000, () => bot.isImmune = false);
                if (bot.health <= 0) {
                    bot.sprite.setVisible(false); bot.nameTag.setVisible(false); bot.hearts.clear();
                    this.showDeathMessage(bot.nameTag.text, bot.sprite.x, bot.sprite.y);
                }
            });
        });
    }

    handleInput() {
        if (this.isDashing) return;

        if (this.gameState.isImmune) {
            this.player.setAlpha(0.5 + Math.sin(this.time.now / 100) * 0.5);
        } else {
            this.player.setAlpha(1);
        }

        if (this.cursors.left.isDown) {
            this.player.setVelocityX(-160);
            this.player.anims.play('left', true);
            if (Phaser.Input.Keyboard.JustDown(this.cursors.shift) && this.canDash) this.dash(-1000);
        } else if (this.cursors.right.isDown) {
            this.player.setVelocityX(160);
            this.player.anims.play('right', true);
            if (Phaser.Input.Keyboard.JustDown(this.cursors.shift) && this.canDash) this.dash(1000);
        } else {
            this.player.setVelocityX(0);
            this.player.anims.play('turn');
        }
        if ((this.cursors.up.isDown || this.cursors.space.isDown) && (this.player.body!.blocked.down || this.player.body!.touching.down)) this.player.setVelocityY(-330);
    }

    dash(velocity: number) {
        this.isDashing = true; this.canDash = false;
        this.player.setVelocityX(velocity);
        this.time.delayedCall(200, () => { this.isDashing = false; });
        this.time.delayedCall(1000, () => { this.canDash = true; });
    }

    updateUI() {
        this.drawHearts(this.playerHearts, this.player.x, this.player.y - 40, this.gameState.health);
        this.playerNameTag.setPosition(this.player.x, this.player.y - 55);
        if (this.player.body && Math.abs(this.player.body.velocity.x) > 10) this.player.setFlipX(this.player.body.velocity.x < 0);
    }

    drawHearts(graphics: Phaser.GameObjects.Graphics, x: number, y: number, count: number) {
        graphics.clear();
        for (let i = 0; i < 3; i++) {
            graphics.fillStyle(i < count ? 0xff0000 : 0x333333, 1);
            graphics.fillCircle(x - 20 + (i * 20), y, 6);
            graphics.lineStyle(2, 0, 1).strokeCircle(x - 20 + (i * 20), y, 6);
        }
    }

    emitUpdate() {
        this.socket.emit('playerUpdate', {
            roomCode: this.roomCode, x: this.player.x, y: this.player.y, flipX: this.player.flipX,
            anim: this.player.anims.currentAnim?.key || 'turn', health: this.gameState.health, isImmune: this.gameState.isImmune
        });
    }

    emitHostUpdate() {
        this.socket.emit('hostUpdate', {
            roomCode: this.roomCode,
            stars: this.stars.getChildren().map((s: any) => ({ x: s.x, y: s.y, bounceY: s.bounceY, active: s.active })),
            bombs: this.bombs.getChildren().filter((b: any) => b.active).map((b: any) => ({ x: b.x, y: b.y, vx: b.body.velocity.x, vy: b.body.velocity.y })),
            score: this.gameState.score
        });
    }

    spawnStars() {
        this.stars.clear(true, true);
        for (let i = 0; i < 12; i++) {
            const star = this.stars.create(12 + (i * 70), 0, 'star');
            star.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));
        }
    }

    applyColorFilter(sprite: Phaser.GameObjects.Sprite | any, color: number) {
        if (!sprite || !sprite.setTint) return;
        sprite.setTint(color);
        this.time.delayedCall(500, () => {
            if (sprite && sprite.active && sprite.clearTint) sprite.clearTint();
        });
    }

    showDeathMessage(name: string, x: number, y: number) {
        const txt = this.add.text(x, y, `${name} est mort !`, { 
            fontSize: '24px', color: '#ff0000', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 
        }).setOrigin(0.5);
        this.tweens.add({ targets: txt, y: y - 50, alpha: 0, duration: 3000, onComplete: () => txt.destroy() });
    }

    collectStar(collector: any, star: any) {
        if (!star.active) return;
        const index = this.stars.getChildren().indexOf(star);
        if (index === -1) return;

        this.applyColorFilter(collector, 0xffff00);

        if (!this.isHost) {
            this.socket.emit('starCollected', { roomCode: this.roomCode, starIndex: index });
            this.pendingStarCollections.add(index);
            star.setActive(false).setVisible(false);
            return;
        }

        this.gameState = processStarCollection(this.gameState);
        this.pendingStarCollections.delete(index);
        star.disableBody(true, true);
        this.scoreText.setText('Score: ' + this.gameState.score);
        if (this.stars.countActive(true) === 0) {
            this.spawnStars();
            const x = (this.player.x < 400) ? Phaser.Math.Between(400, 800) : Phaser.Math.Between(0, 400);
            const bomb = this.bombs.create(x, 16, 'bomb');
            bomb.setBounce(1).setCollideWorldBounds(true).setVelocity(Phaser.Math.Between(-200, 200), 20);
        }
    }

    hitBomb() {
        if (this.gameState.isImmune || this.gameState.isSpectator) return;
        
        this.gameState = processHit(this.gameState);
        this.applyColorFilter(this.player, 0xff0000);
        this.player.setVelocity(0, -200);

        if (this.gameState.isSpectator) {
            this.showDeathMessage(this.playerName, this.player.x, this.player.y);
            this.becomeSpectator();
        } else {
            this.time.delayedCall(1000, () => {
                this.gameState.isImmune = false;
            });
        }
        
        // Immediate emit to inform others of health change
        this.emitUpdate();
    }

    becomeSpectator() {
        this.player.setVisible(false).setActive(false);
        if (this.player.body) this.player.body.enable = false;
        this.playerNameTag.setVisible(false); this.playerHearts.clear();
        this.checkGameOverState();
    }

    checkGameOverState() {
        const allHealths = Array.from(this.players.values()).map(p => p.health);
        allHealths.push(this.gameState.health);
        
        if (allHealths.every(h => h <= 0)) {
            this.gameState.gameOver = true;
            this.add.text(400, 300, 'GAME OVER', { fontSize: '64px', color: '#f00', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
            this.time.delayedCall(3000, () => window.location.reload());
        }
    }
}
