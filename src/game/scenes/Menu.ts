import * as Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';

export class Menu extends Phaser.Scene {
    private socket: Socket;
    private menuContainer: HTMLDivElement;

    constructor() {
        super('Menu');
    }

    preload() {
        this.load.setPath('assets');
        this.load.image('sky', 'sky.png');
    }

    create() {
        this.add.image(400, 300, 'sky');
        this.setupUI();
    }

    setupUI() {
        // Create HTML overlay
        this.menuContainer = document.createElement('div');
        this.menuContainer.style.position = 'absolute';
        this.menuContainer.style.top = '50%';
        this.menuContainer.style.left = '50%';
        this.menuContainer.style.transform = 'translate(-50%, -50%)';
        this.menuContainer.style.backgroundColor = 'rgba(20, 20, 30, 0.95)';
        this.menuContainer.style.padding = '30px';
        this.menuContainer.style.borderRadius = '15px';
        this.menuContainer.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
        this.menuContainer.style.display = 'flex';
        this.menuContainer.style.flexDirection = 'column';
        this.menuContainer.style.gap = '15px';
        this.menuContainer.style.fontFamily = 'Arial, sans-serif';
        this.menuContainer.style.minWidth = '300px';
        this.menuContainer.style.color = 'white';
        this.menuContainer.id = 'menu-container';

        document.body.appendChild(this.menuContainer);

        this.showMainMenu();
    }

    showMainMenu() {
        this.menuContainer.innerHTML = `
            <h1 style="margin:0; text-align:center; color: #4CAF50; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">PHASER MULTI</h1>
            
            <div style="display:flex; flexDirection:column; gap:5px;">
                <label style="font-size: 14px; color: #aaa;">Ton Nom :</label>
                <input type="text" id="playerName" placeholder="Ex: Bob" style="padding:12px; font-size:16px; border-radius:5px; border:none; outline:none;">
            </div>

            <hr style="width:100%; border:0; border-top:1px solid #444; margin:10px 0;">

            <button id="btnCreate" style="padding:15px; background:#4CAF50; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; font-size:16px; transition: 0.2s;">CRÉER UN SALON</button>
            
            <div style="display:flex; flexDirection:column; gap:5px; margin-top:10px;">
                <label style="font-size: 14px; color: #aaa;">Rejoindre avec un code :</label>
                <div style="display:flex; gap:5px;">
                    <input type="text" id="roomCode" placeholder="CODE" style="padding:12px; width:100px; font-size:16px; text-transform:uppercase; border-radius:5px; border:none; text-align:center; font-weight:bold;">
                    <button id="btnJoin" style="padding:12px; background:#2196F3; color:white; border:none; border-radius:5px; cursor:pointer; flex-grow:1; font-weight:bold;">REJOINDRE</button>
                </div>
            </div>
            
            <div id="errorMsg" style="color:#ff5252; font-size:14px; text-align:center; min-height:16px; font-weight:bold;"></div>
        `;

        const btnCreate = document.getElementById('btnCreate');
        const btnJoin = document.getElementById('btnJoin');
        const playerNameInput = document.getElementById('playerName') as HTMLInputElement;
        const roomCodeInput = document.getElementById('roomCode') as HTMLInputElement;

        // Auto-connect socket
        if (!this.socket) {
            this.socket = io(window.location.hostname === 'localhost' ? 'http://localhost:8081' : 'https://gamjamonline.onrender.com');
            
            this.socket.on('error', (msg: string) => {
                const errorDiv = document.getElementById('errorMsg');
                if (errorDiv) errorDiv.innerText = msg;
            });

            this.socket.on('roomCreated', (room) => this.showLobby(room));
            this.socket.on('joinedRoom', (room) => this.showLobby(room));
        }

        btnCreate?.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            if (!name) return this.showError('Entre un nom !');
            this.socket.emit('createRoom', { playerName: name, maxPlayers: 100 });
        });

        btnJoin?.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            const code = roomCodeInput.value.trim().toUpperCase();
            if (!name) return this.showError('Entre un nom !');
            if (!code) return this.showError('Entre un code !');
            this.socket.emit('joinRoom', { playerName: name, roomCode: code });
        });
    }

    showError(msg: string) {
        const errorDiv = document.getElementById('errorMsg');
        if (errorDiv) errorDiv.innerText = msg;
    }

    showLobby(room: any) {
        this.menuContainer.innerHTML = `
            <h2 style="margin:0; text-align:center;">SALON : <span style="color:#2196F3; letter-spacing: 2px;">${room.code}</span></h2>
            <p style="margin:0; text-align:center; font-size:13px; color:#aaa;">Partage ce code pour jouer ensemble</p>
            
            <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 10px;">
                <label style="font-size: 12px; color: #4CAF50; font-weight: bold;">JOUEURS CONNECTÉS :</label>
                <div id="playerList" style="margin-top:10px; max-height:150px; overflow-y:auto; display:flex; flex-direction:column; gap:5px;">
                    ${room.players.map((p: any) => `
                        <div style="display:flex; justify-content:space-between; padding:5px; border-bottom: 1px solid #333;">
                            <span>${p.name}</span>
                            <span style="font-size:10px; color:#666;">${p.id === this.socket.id ? 'MOI' : ''} ${p.isHost ? 'HÔTE' : ''}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            ${room.hostId === this.socket.id ? `
                <div style="display:flex; flex-direction:column; gap:5px; margin-top:10px;">
                    <label style="font-size: 14px; color: #aaa;">Limite de joueurs :</label>
                    <input type="number" id="maxPlayers" value="${room.maxPlayers}" min="2" max="100" style="padding:10px; border-radius:5px; border:none; text-align:center; font-weight:bold;">
                </div>
                <button id="btnAddBot" style="padding:10px; background:#2196F3; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; margin-top:10px;">AJOUTER UN BOT</button>
                <button id="btnStart" style="padding:15px; background:#4CAF50; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; font-size:18px; margin-top:10px;">LANCER LA PARTIE</button>
            ` : `
                <div style="text-align:center; padding:20px; color:#aaa; font-style:italic;">En attente de l'hôte...</div>
            `}
            
            <button id="btnLeave" style="padding:10px; background:transparent; color:#ff5252; border:1px solid #ff5252; border-radius:5px; cursor:pointer; font-weight:bold; margin-top:5px;">QUITTER</button>
        `;

        const btnStart = document.getElementById('btnStart');
        const btnAddBot = document.getElementById('btnAddBot');
        const btnLeave = document.getElementById('btnLeave');
        const maxPlayersInput = document.getElementById('maxPlayers') as HTMLInputElement;

        btnAddBot?.addEventListener('click', () => {
            this.socket.emit('spawnBot', room.code);
        });

        this.socket.off('playerJoined');
        this.socket.on('playerJoined', (player) => {
            const list = document.getElementById('playerList');
            if (list) {
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.style.padding = '5px';
                div.style.borderBottom = '1px solid #333';
                div.innerHTML = `<span>${player.name}</span><span style="font-size:10px; color:#666;"></span>`;
                list.appendChild(div);
            }
        });

        this.socket.off('gameStarted');
        this.socket.on('gameStarted', () => {
            this.menuContainer.remove();
            this.scene.start('Game', { socket: this.socket, roomCode: room.code });
        });

        btnStart?.addEventListener('click', () => {
            this.socket.emit('startGame', room.code);
        });

        btnLeave?.addEventListener('click', () => {
            window.location.reload();
        });

        maxPlayersInput?.addEventListener('change', () => {
            this.socket.emit('updateMaxPlayers', { roomCode: room.code, maxPlayers: maxPlayersInput.value });
        });
    }
}
