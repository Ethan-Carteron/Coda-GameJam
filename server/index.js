const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms = new Map();

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('createRoom', ({ playerName, maxPlayers }) => {
        const roomCode = generateRoomCode();
        const roomData = {
            code: roomCode,
            hostId: socket.id,
            maxPlayers: parseInt(maxPlayers) || 100,
            players: [{ id: socket.id, name: playerName, isHost: true }],
            gameStarted: false
        };
        rooms.set(roomCode, roomData);
        socket.join(roomCode);
        socket.emit('roomCreated', roomData);
    });

    socket.on('joinRoom', ({ playerName, roomCode }) => {
        const room = rooms.get(roomCode.toUpperCase());
        
        if (!room) {
            return socket.emit('error', 'Salon non trouvé');
        }

        if (room.players.length >= room.maxPlayers) {
            return socket.emit('error', 'Le salon est plein');
        }

        const nameExists = room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase());
        if (nameExists) {
            return socket.emit('error', 'Ce nom existe déjà dans ce salon');
        }

        if (room.gameStarted) {
            return socket.emit('error', 'La partie a déjà commencé');
        }

        const newPlayer = { id: socket.id, name: playerName, isHost: false };
        room.players.push(newPlayer);
        socket.join(roomCode);
        
        socket.emit('joinedRoom', room);
        socket.to(roomCode).emit('playerJoined', newPlayer);
    });

    socket.on('updateMaxPlayers', ({ roomCode, maxPlayers }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.maxPlayers = parseInt(maxPlayers);
            io.to(roomCode).emit('maxPlayersUpdated', room.maxPlayers);
        }
    });

    socket.on('startGame', (roomCode) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.gameStarted = true;
            io.to(roomCode).emit('gameStarted');
        }
    });

    socket.on('getRoomInfo', (roomCode) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.emit('roomInfo', room);
        }
    });

    socket.on('starCollected', ({ roomCode, starIndex }) => {
        const room = rooms.get(roomCode);
        if (room) {
            // Tell the host to remove this star
            io.to(room.hostId).emit('collectStarAt', starIndex);
        }
    });

    socket.on('playerUpdate', (data) => {
        // Relay movement and state to others in the room
        socket.to(data.roomCode).emit('playerMoved', {
            id: socket.id,
            x: data.x,
            y: data.y,
            flipX: data.flipX,
            anim: data.anim,
            isDashing: data.isDashing,
            health: data.health,
            isImmune: data.isImmune
        });
    });

    socket.on('hostUpdate', (data) => {
        // Host relays stars, bombs, and common score
        socket.to(data.roomCode).emit('gameStateSync', {
            stars: data.stars,
            bombs: data.bombs,
            score: data.score
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const [code, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const isHost = room.hostId === socket.id;
                room.players.splice(playerIndex, 1);
                
                if (isHost) {
                    io.to(code).emit('hostLeft');
                    rooms.delete(code);
                } else {
                    io.to(code).emit('playerLeft', socket.id);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
