import { describe, it, expect } from 'vitest';
import { processHit, processStarCollection, checkGameOver, GameState } from './logic';

describe('Règles Métier du Jeu', () => {
    
    it('doit perdre une vie quand un ennemi touche le joueur', () => {
        const initialState: GameState = { health: 3, isImmune: false, score: 0, isSpectator: false, gameOver: false };
        const newState = processHit(initialState);
        expect(newState.health).toBe(2);
        expect(newState.isImmune).toBe(true);
    });

    it('doit devenir spectateur quand il perd sa dernière vie', () => {
        const initialState: GameState = { health: 1, isImmune: false, score: 0, isSpectator: false, gameOver: false };
        const newState = processHit(initialState);
        expect(newState.health).toBe(0);
        expect(newState.isSpectator).toBe(true);
    });

    it('ne doit pas perdre de vie s\'il est déjà immunisé', () => {
        const initialState: GameState = { health: 2, isImmune: true, score: 0, isSpectator: false, gameOver: false };
        const newState = processHit(initialState);
        expect(newState.health).toBe(2);
    });

    it('doit augmenter le score quand une étoile est ramassée', () => {
        const initialState: GameState = { health: 3, isImmune: false, score: 0, isSpectator: false, gameOver: false };
        const newState = processStarCollection(initialState);
        expect(newState.score).toBe(10);
    });

    it('doit déclencher Game Over quand TOUS les joueurs ont 0 vie', () => {
        expect(checkGameOver([0, 0, 0])).toBe(true);
        expect(checkGameOver([0, 1, 0])).toBe(false);
    });
});
