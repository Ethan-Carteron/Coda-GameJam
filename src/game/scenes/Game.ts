import * as Phaser from 'phaser';
import { Socket } from 'socket.io-client';

interface PlayerData {
    id: string;
    name: string;
    isHost: boolean;
}

export class Game extends Phaser.Scene {
    private socket: Socket;
    private roomCode: string;
    private isHost: boolean;
    private playerName: string;

    private player: Phaser.Physics.Arcade.Sprite;
    private players: Map<string, { 
        sprite: Phaser.Physics.Arcade.Sprite, 
        nameTag: Phaser.GameObjects.Text,
        hearts: Phaser.GameObjects.Graphics,
        health: number
    }> = new Map();

    private stars: Phaser.Physics.Arcade.Group;
    private bombs: Phaser.Physics.Arcade.Group;
    private platforms: Phaser.Physics.Arcade.StaticGroup;
    private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    
    private score = 0;
    private gameOver = false;
    private scoreText: Phaser.GameObjects.Text;
    
    private canDash = true;
    private isDashing = false;
    private health = 3;
    private isImmune = false;
    private isSpectator = false;

    private playerHearts: Phaser.GameObjects.Graphics;
    private playerNameTag: Phaser.GameObjects.Text;

    constructor() {
        super('Game');
    }

    init(data: { socket: Socket, roomCode: string }) {
        this.socket = data.socket;
        this.roomCode = data.roomCode;
        this.gameOver = false;
        this.isSpectator = false;
        this.health = 3;
        this.score = 0;
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
        
        this.playerNameTag = this.add.text(0, 0, '', { 
            fontSize: '14px', 
            color: '#ffffff', 
            stroke: '#000000', 
            strokeThickness: 3,
            fontStyle: 'bold' 
        }).setOrigin(0.5);
        this.playerHearts = this.add.graphics();
    }

    setupPhysics() {
        this.physics.add.collider(this.player, this.platforms);
        this.physics.add.collider(this.stars, this.platforms);
        this.physics.add.collider(this.bombs, this.platforms);

        // Standard overlap for Host
        this.physics.add.overlap(this.player, this.stars, this.collectStar, undefined, this);
        this.physics.add.collider(this.player, this.bombs, this.hitBomb, undefined, this);
    }

    setupUI() {
        this.scoreText = this.add.text(16, 16, 'Score: 0', { 
            fontSize: '32px', 
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        });
    }

    setupSocketListeners() {
        this.socket.emit('getRoomInfo', this.roomCode);

        this.socket.on('roomInfo', (room) => {
            this.isHost = room.hostId === this.socket.id;
            const me = room.players.find((p: any) => p.id === this.socket.id);
            this.playerName = me ? me.name : 'Joueur';
            this.playerNameTag.setText(this.playerName);

            room.players.forEach((p: any) => {
                if (p.id !== this.socket.id) this.addRemotePlayer(p);
            });

            if (this.isHost && this.stars.countActive(true) === 0) {
                this.spawnStars();
            }
        });

        this.socket.on('playerJoined', (p) => this.addRemotePlayer(p));
        this.socket.on('playerLeft', (id) => this.removeRemotePlayer(id));
        this.socket.on('playerMoved', (data) => this.updateRemotePlayer(data));
        this.socket.on('gameStateSync', (data) => this.syncGameState(data));
        
        this.socket.on('collectStarAt', (index) => {
            if (this.isHost) {
                const star = this.stars.getChildren()[index] as Phaser.Physics.Arcade.Sprite;
                if (star) {
                    this.collectStar(null, star);
                }
            }
        });

        this.socket.on('hostLeft', () => {
            alert("L'hôte a quitté la partie.");
            window.location.reload();
        });
    }

    addRemotePlayer(p: PlayerData) {
        if (this.players.has(p.id)) return;
        const sprite = this.physics.add.sprite(100, 450, 'dude');
        sprite.setImmovable(true);
        (sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        
        const nameTag = this.add.text(0, 0, p.name, { 
            fontSize: '14px', 
            color: '#ffffff', 
            stroke: '#000000', 
            strokeThickness: 3,
            fontStyle: 'bold'
        }).setOrigin(0.5);
        const hearts = this.add.graphics();
        
        this.players.set(p.id, { sprite, nameTag, hearts, health: 3 });
    }

    removeRemotePlayer(id: string) {
        const p = this.players.get(id);
        if (p) {
            p.sprite.destroy();
            p.nameTag.destroy();
            p.hearts.destroy();
            this.players.delete(id);
        }
    }

    updateRemotePlayer(data: any) {
        const p = this.players.get(data.id);
        if (p) {
            p.health = data.health;
            if (p.health <= 0) {
                p.sprite.setVisible(false);
                p.nameTag.setVisible(false);
                p.hearts.clear();
                return;
            }

            p.sprite.setVisible(true);
            p.nameTag.setVisible(true);
            p.sprite.setPosition(data.x, data.y);
            p.sprite.setFlipX(data.flipX);
            if (data.anim) p.sprite.anims.play(data.anim, true);
            
            this.drawHearts(p.hearts, data.x, data.y - 40, data.health);
            p.nameTag.setPosition(data.x, data.y - 55);
            
            if (data.isImmune) {
                p.sprite.setAlpha(0.5 + Math.sin(this.time.now / 100) * 0.5);
            } else {
                p.sprite.setAlpha(1);
            }
        }
    }

    syncGameState(data: any) {
        if (this.isHost) return;

        this.score = data.score;
        this.scoreText.setText('Score: ' + this.score);

        const currentStars = this.stars.getChildren();
        data.stars.forEach((s: any, index: number) => {
            let star = currentStars[index] as Phaser.Physics.Arcade.Sprite;
            if (!star) {
                star = this.stars.create(s.x, s.y, 'star');
            }
            
            if (s.active) {
                star.setActive(true).setVisible(true);
                star.setPosition(s.x, s.y);
                // On client, we don't necessarily need body to be enabled for visual sync
                if (star.body) star.body.enable = true;
            } else {
                star.setActive(false).setVisible(false);
                if (star.body) star.body.enable = false;
            }
        });

        const currentBombs = this.bombs.getChildren();
        data.bombs.forEach((b: any, index: number) => {
            let bomb = currentBombs[index] as Phaser.Physics.Arcade.Sprite;
            if (!bomb) {
                bomb = this.bombs.create(b.x, b.y, 'bomb');
            } else {
                bomb.enableBody(true, b.x, b.y, true, true);
            }
            bomb.setBounce(1);
            bomb.setCollideWorldBounds(true);
            bomb.setVelocity(b.vx, b.vy);
        });
        
        for (let i = data.bombs.length; i < currentBombs.length; i++) {
            (currentBombs[i] as Phaser.Physics.Arcade.Sprite).disableBody(true, true);
        }
    }

    update() {
        if (this.gameOver) return;

        if (this.isHost) {
            this.emitHostUpdate();
        }

        if (!this.isSpectator) {
            if (this.isImmune) {
                this.player.setAlpha(0.5 + Math.sin(this.time.now / 100) * 0.5);
                this.player.setVelocityX(0);
            } else if (!this.isDashing) {
                this.handleInput();
            }
            this.updateUI();

            // MANUAL OVERLAP CHECK FOR CLIENTS
            if (!this.isHost) {
                this.checkManualOverlap();
            }
        }

        this.emitUpdate();
    }

    checkManualOverlap() {
        const playerBounds = this.player.getBounds();
        this.stars.getChildren().forEach((star: any, index: number) => {
            if (star.active && star.visible) {
                const starBounds = star.getBounds();
                if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, starBounds)) {
                    this.collectStar(this.player, star);
                }
            }
        });
    }

    handleInput() {
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

        if ((this.cursors.up.isDown || this.cursors.space.isDown) && (this.player.body!.blocked.down || this.player.body!.touching.down)) {
            this.player.setVelocityY(-330);
        }
    }

    dash(velocity: number) {
        this.isDashing = true;
        this.canDash = false;
        this.player.setVelocityX(velocity);
        this.time.delayedCall(200, () => { this.isDashing = false; });
        this.time.delayedCall(1000, () => { this.canDash = true; });
    }

    updateUI() {
        this.drawHearts(this.playerHearts, this.player.x, this.player.y - 40, this.health);
        this.playerNameTag.setPosition(this.player.x, this.player.y - 55);
        if (this.player.body && Math.abs(this.player.body.velocity.x) > 10) {
            this.player.setFlipX(this.player.body.velocity.x < 0);
        }
    }

    drawHearts(graphics: Phaser.GameObjects.Graphics, x: number, y: number, count: number) {
        graphics.clear();
        for (let i = 0; i < 3; i++) {
            graphics.fillStyle(i < count ? 0xff0000 : 0x333333, 1);
            graphics.fillCircle(x - 20 + (i * 20), y, 6);
            graphics.lineStyle(2, 0x000000, 1);
            graphics.strokeCircle(x - 20 + (i * 20), y, 6);
        }
    }

    emitUpdate() {
        this.socket.emit('playerUpdate', {
            roomCode: this.roomCode,
            x: this.player.x,
            y: this.player.y,
            flipX: this.player.flipX,
            anim: this.player.anims.currentAnim ? this.player.anims.currentAnim.key : 'turn',
            isDashing: this.isDashing,
            health: this.health,
            isImmune: this.isImmune
        });
    }

    emitHostUpdate() {
        const starsData = this.stars.getChildren().map((s: any) => ({
            x: s.x,
            y: s.y,
            bounceY: s.bounceY,
            active: s.active
        }));
            
        const bombsData = this.bombs.getChildren()
            .filter((b: any) => b.active)
            .map((b: any) => ({ 
                x: b.x, 
                y: b.y, 
                vx: b.body.velocity.x, 
                vy: b.body.velocity.y 
            }));

        this.socket.emit('hostUpdate', {
            roomCode: this.roomCode,
            stars: starsData,
            bombs: bombsData,
            score: this.score
        });
    }

    spawnStars() {
        this.stars.clear(true, true);
        for (let i = 0; i < 12; i++) {
            const star = this.stars.create(12 + (i * 70), 0, 'star');
            star.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));
        }
    }

    collectStar(_player: any, star: any) {
        const index = this.stars.getChildren().indexOf(star);
        if (index === -1 || !star.active) return;

        if (!this.isHost) {
            // Signal to host
            this.socket.emit('starCollected', { roomCode: this.roomCode, starIndex: index });
            // Deactivate locally for feedback
            star.setActive(false).setVisible(false);
            return;
        }

        // Host logic
        star.disableBody(true, true);
        this.score += 10;
        this.scoreText.setText('Score: ' + this.score);

        if (this.stars.countActive(true) === 0) {
            this.spawnStars();
            const x = (this.player.x < 400) ? Phaser.Math.Between(400, 800) : Phaser.Math.Between(0, 400);
            const bomb = this.bombs.create(x, 16, 'bomb');
            bomb.setBounce(1);
            bomb.setCollideWorldBounds(true);
            bomb.setVelocity(Phaser.Math.Between(-200, 200), 20);
        }
    }

    hitBomb() {
        if (this.isImmune || this.isSpectator || this.isDashing) return;

        this.health--;
        this.isImmune = true;
        this.player.setTint(0xff0000);
        this.player.setVelocity(0, 0);

        this.tweens.addCounter({
            from: 255, to: 0, duration: 1000,
            onUpdate: (tween) => {
                const val = Math.floor(tween.getValue());
                this.player.setTint(Phaser.Display.Color.GetColor(255, 255 - val, 255 - val));
            },
            onComplete: () => { this.player.clearTint(); }
        });

        if (this.health <= 0) {
            this.becomeSpectator();
        } else {
            this.time.delayedCall(3000, () => {
                this.isImmune = false;
                this.player.setAlpha(1);
            });
        }
    }

    becomeSpectator() {
        this.isSpectator = true;
        this.player.setVisible(false);
        this.player.setActive(false);
        if (this.player.body) this.player.body.enable = false;
        this.playerNameTag.setVisible(false);
        this.playerHearts.clear();
        this.checkGameOver();
    }

    checkGameOver() {
        const anyAlive = Array.from(this.players.values()).some(p => p.health > 0) || this.health > 0;
        if (!anyAlive) {
            this.gameOver = true;
            this.add.text(400, 300, 'GAME OVER', { 
                fontSize: '64px', color: '#ff0000', stroke: '#000000', strokeThickness: 6
            }).setOrigin(0.5);
            this.time.delayedCall(3000, () => { window.location.reload(); });
        }
    }
}
