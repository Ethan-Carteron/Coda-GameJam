const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = new Map();

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on('connection', (socket) => {
    socket.on('createRoom', ({ playerName, maxPlayers }) => {
        const roomCode = generateRoomCode();
        const roomData = {
            code: roomCode, hostId: socket.id, maxPlayers: parseInt(maxPlayers) || 100,
            players: [{ id: socket.id, name: playerName, isHost: true }],
            gameStarted: false
        };
        rooms.set(roomCode, roomData);
        socket.join(roomCode);
        socket.emit('roomCreated', roomData);
    });

    socket.on('joinRoom', ({ playerName, roomCode }) => {
        const code = roomCode.toUpperCase();
        const room = rooms.get(code);
        if (!room) return socket.emit('error', 'Salon non trouvé');
        if (room.players.length >= room.maxPlayers) return socket.emit('error', 'Le salon est plein');
        if (room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) return socket.emit('error', 'Ce nom existe déjà');
        
        const newPlayer = { id: socket.id, name: playerName, isHost: false };
        room.players.push(newPlayer);
        socket.join(code);
        socket.emit('joinedRoom', room);
        socket.to(code).emit('playerJoined', newPlayer);
    });

    socket.on('getRoomInfo', (roomCode) => {
        const room = rooms.get(roomCode.toUpperCase());
        if (room) socket.emit('roomInfo', room);
    });

    socket.on('starCollected', ({ roomCode, starIndex }) => {
        const room = rooms.get(roomCode.toUpperCase());
        if (room) {
            // RELAIS CRITIQUE : Envoyer l'index à l'hôte
            io.to(room.hostId).emit('collectStarAt', starIndex);
        }
    });

    socket.on('startGame', (roomCode) => {
        const room = rooms.get(roomCode.toUpperCase());
        if (room && room.hostId === socket.id) {
            room.gameStarted = true;
            io.to(roomCode).emit('gameStarted');
        }
    });

    socket.on('playerUpdate', (data) => {
        socket.to(data.roomCode.toUpperCase()).emit('playerMoved', {
            id: socket.id, x: data.x, y: data.y, flipX: data.flipX,
            anim: data.anim, health: data.health, isImmune: data.isImmune
        });
    });

    socket.on('hostUpdate', (data) => {
        socket.to(data.roomCode.toUpperCase()).emit('gameStateSync', {
            stars: data.stars, bombs: data.bombs, score: data.score
        });
    });

    socket.on('disconnect', () => {
        for (const [code, room] of rooms.entries()) {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                if (room.hostId === socket.id) {
                    io.to(code).emit('hostLeft');
                    rooms.delete(code);
                } else {
                    room.players.splice(idx, 1);
                    io.to(code).emit('playerLeft', socket.id);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
