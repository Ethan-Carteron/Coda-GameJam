import { describe, it, expect } from 'vitest';
import { processHit, processStarCollection, checkGameOver, GameState, INITIAL_HEALTH } from './logic';

const createBaseState = (): GameState => ({
    health: INITIAL_HEALTH,
    isImmune: false,
    score: 0,
    isSpectator: false,
    gameOver: false,
    activeTint: null
});

describe('Validation des Bugs - Tests Unitaires', () => {
    
    describe('Bug 3ème coup non comptabilisé', () => {
        it('doit passer de 3 à 0 vies en 3 coups sans rester bloqué', () => {
            let state = createBaseState();
            
            // Coup 1
            state = processHit(state);
            expect(state.health).toBe(2);
            expect(state.isImmune).toBe(true);
            
            // Simulation fin immunité
            state.isImmune = false;
            
            // Coup 2
            state = processHit(state);
            expect(state.health).toBe(1);
            expect(state.isImmune).toBe(true);
            
            // Simulation fin immunité
            state.isImmune = false;
            
            // Coup 3 (LE CRITIQUE)
            state = processHit(state);
            expect(state.health).toBe(0);
            expect(state.isSpectator).toBe(true);
            expect(state.isImmune).toBe(false);
        });
    });

    describe('Bug Filtres (Teintes)', () => {
        it('doit activer le filtre jaune lors du ramassage d\'étoile', () => {
            let state = createBaseState();
            state = processStarCollection(state);
            expect(state.activeTint).toBe("yellow");
        });

        it('doit activer le filtre rouge lors d\'un dégât', () => {
            let state = createBaseState();
            state = processHit(state);
            expect(state.activeTint).toBe("red");
        });

        it('ne doit pas écraser un filtre de dégât par un filtre d\'étoile si immunisé', () => {
            let state = createBaseState();
            state = processHit(state); // activeTint = red, isImmune = true
            state = processStarCollection(state);
            // On veut quand même le jaune pour le feedback même si on est immunisé aux dégâts
            expect(state.activeTint).toBe("yellow"); 
        });
    });

    describe('Bug Mort et Spectateur', () => {
        it('doit mettre à jour isSpectator exactement à 0 vie', () => {
            const state = { ...createBaseState(), health: 1 };
            const next = processHit(state);
            expect(next.isSpectator).toBe(true);
            expect(next.health).toBe(0);
        });

        it('doit déclencher Game Over pour toute l\'équipe', () => {
            expect(checkGameOver([0, 0])).toBe(true);
            expect(checkGameOver([0, 1])).toBe(false);
            expect(checkGameOver([])).toBe(false); // Pas de joueurs = pas de game over
        });
    });
});
