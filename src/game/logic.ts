// Game Logic - Pure functions for testing

export interface GameState {
    health: number;
    isImmune: boolean;
    score: number;
    isSpectator: boolean;
    gameOver: boolean;
    activeTint: string | null; // "red", "yellow", or null
}

export const INITIAL_HEALTH = 3;
export const STAR_SCORE = 10;

export const processHit = (state: GameState): GameState => {
    // BUG POTENTIEL : Si on est déjà immunisé, on ignore le coup.
    // Mais si l'immunité dure trop longtemps, le 3ème coup peut être raté.
    if (state.isImmune || state.isSpectator || state.gameOver) return state;

    const newHealth = state.health - 1;
    const isDead = newHealth <= 0;

    return {
        ...state,
        health: newHealth,
        isImmune: !isDead, // On n'est plus "immune" si on est mort
        isSpectator: isDead,
        activeTint: "red"
    };
};

export const processStarCollection = (state: GameState): GameState => {
    if (state.isSpectator || state.gameOver) return state;
    return {
        ...state,
        score: state.score + STAR_SCORE,
        activeTint: "yellow"
    };
};

export const checkGameOver = (playersHealth: number[]): boolean => {
    if (playersHealth.length === 0) return false;
    return playersHealth.every(h => h <= 0);
};
