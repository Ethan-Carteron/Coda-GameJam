import { describe, it, expect, vi } from 'vitest';

// Simuler le comportement du serveur node
const simulateServer = (rooms, socket, event, data, ioEmit) => {
    if (event === 'starCollected') {
        const room = rooms.get(data.roomCode);
        if (room) {
            ioEmit(room.hostId, 'collectStarAt', { starIndex: data.starIndex });
        }
    }
};

describe('Test de relais du serveur', () => {
    it('Le serveur doit relayer l\'index exact à l\'hôte', () => {
        const rooms = new Map();
        rooms.set('ROOM1', { hostId: 'HOST_123', players: [] });
        
        const ioEmit = vi.fn();
        const clientData = { roomCode: 'ROOM1', starIndex: 7 };
        
        simulateServer(rooms, {}, 'starCollected', clientData, ioEmit);
        
        // Est-ce que le serveur appelle bien l'émission vers l'hôte avec le bon index ?
        expect(ioEmit).toHaveBeenCalledWith('HOST_123', 'collectStarAt', { starIndex: 7 });
    });
});
