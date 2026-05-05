// Game Logic - Pure functions for testing

export interface GameState {
    health: number;
    isImmune: boolean;
    score: number;
    isSpectator: boolean;
    gameOver: boolean;
}

export const processHit = (state: GameState): GameState => {
    if (state.isImmune || state.isSpectator || state.gameOver) return state;

    const newHealth = state.health - 1;
    return {
        ...state,
        health: newHealth,
        isImmune: newHealth > 0,
        isSpectator: newHealth <= 0
    };
};

export const processStarCollection = (state: GameState): GameState => {
    if (state.isSpectator || state.gameOver) return state;
    return {
        ...state,
        score: state.score + 10
    };
};

export const checkGameOver = (allPlayersHealth: number[]): boolean => {
    return allPlayersHealth.every(h => h <= 0);
};
