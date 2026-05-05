import { describe, it, expect, vi } from 'vitest';

// Simulation simplifiée de la logique de Game.ts pour isoler le bug
class GameSimulation {
    isHost: boolean;
    stars: { id: number, active: boolean }[] = [];
    socket: any;
    score: number = 0;

    constructor(isHost: boolean, socket: any) {
        this.isHost = isHost;
        this.socket = socket;
        // On initialise 12 étoiles
        for (let i = 0; i < 12; i++) this.stars.push({ id: i, active: true });
    }

    // La fonction de collision que l'on veut tester
    collectStar(starIndex: number) {
        const star = this.stars[starIndex];
        if (!star || !star.active) return;

        if (!this.isHost) {
            // BUG POTENTIEL : Le client désactive l'étoile localement 
            // MAIS est-ce que l'hôte reçoit l'info correctement ?
            this.socket.emit('starCollected', { starIndex });
            star.active = false; 
            return;
        }

        // Logique Hôte
        star.active = false;
        this.score += 10;
    }

    // Simulation de la réception du message serveur
    handleServerMessage(event: string, data: any) {
        if (event === 'collectStarAt' && this.isHost) {
            this.collectStar(data.starIndex);
        }
    }
}

describe('Investigation du bug de récupération des étoiles', () => {
    
    it('L\'hôte doit pouvoir ramasser une étoile', () => {
        const host = new GameSimulation(true, { emit: vi.fn() });
        host.collectStar(0);
        expect(host.stars[0].active).toBe(false);
        expect(host.score).toBe(10);
    });

    it('Le client doit pouvoir signaler un ramassage à l\'hôte', () => {
        const mockSocket = {
            emit: vi.fn((event, data) => {
                // Simulation du passage par le serveur vers l'hôte
                if (event === 'starCollected') {
                    host.handleServerMessage('collectStarAt', data);
                }
            })
        };

        const host = new GameSimulation(true, { emit: vi.fn() });
        const client = new GameSimulation(false, mockSocket);

        // Action : Le client touche l'étoile 5
        client.collectStar(5);

        // Vérification 1 : Le client l'a désactivée visuellement
        expect(client.stars[5].active).toBe(false);

        // Vérification 2 : L'hôte a-t-il reçu l'ordre et mis à jour le score ?
        // C'EST ICI QUE ÇA RISQUE DE PLANTER
        expect(host.stars[5].active).toBe(false, "L'hôte n'a pas désactivé l'étoile après le message du client");
        expect(host.score).toBe(10, "Le score de l'hôte n'a pas augmenté après la collecte du client");
    });
});
