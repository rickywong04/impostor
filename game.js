// Game Logic
// WORD_DATABASE is loaded from wordDatabase.js

// ==========================================
// GAME STATE
// ==========================================
const GamePhase = {
    LOBBY: 'lobby',
    REVEAL: 'reveal',
    SUBMISSION: 'submission',
    DISCUSSION: 'discussion',
    VOTING: 'voting',
    RESULTS: 'results'
};

let gameState = {
    phase: GamePhase.LOBBY,
    roomCode: null,
    players: [],
    currentWordData: null,
    impostorIndex: -1,
    jesterIndex: -1,
    jesterEnabled: false,
    noTopicReveal: false,      // When true, crew doesn't see the topic
    impostorHint: true,        // When true, impostor gets a hint word
    currentPlayerIndex: 0,
    revealPlayerIndex: 0,
    submittedWords: [],
    votes: {},
    timer: 0,
    timerInterval: null,
    isHost: false
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function getRandomWordData() {
    return WORD_DATABASE[Math.floor(Math.random() * WORD_DATABASE.length)];
}

// ==========================================
// TIMER FUNCTIONS
// ==========================================
function startTimer(seconds, onTick, onComplete) {
    clearInterval(gameState.timerInterval);
    gameState.timer = seconds;
    onTick(gameState.timer);

    gameState.timerInterval = setInterval(() => {
        gameState.timer--;
        onTick(gameState.timer);

        if (gameState.timer <= 0) {
            clearInterval(gameState.timerInterval);
            onComplete();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(gameState.timerInterval);
}

// ==========================================
// GAME FLOW FUNCTIONS
// ==========================================
function initGame() {
    // Reset game state
    gameState = {
        phase: GamePhase.LOBBY,
        roomCode: null,
        players: [],
        currentWordData: null,
        impostorIndex: -1,
        jesterIndex: -1,
        jesterEnabled: false,
        currentPlayerIndex: 0,
        revealPlayerIndex: 0,
        submittedWords: [],
        votes: {},
        timer: 0,
        timerInterval: null,
        isHost: false
    };
}

function hostGame(hostName) {
    initGame();
    gameState.roomCode = generateRoomCode();
    gameState.isHost = true;
    gameState.players.push({
        name: hostName,
        avatar: getRandomAvatar(),
        isHost: true
    });
    return gameState.roomCode;
}

function joinGame(playerName, roomCode) {
    if (!roomCode || roomCode.length !== 4) {
        return { success: false, error: 'Invalid room code' };
    }

    gameState.players.push({
        name: playerName,
        avatar: getRandomAvatar(),
        isHost: false
    });
    gameState.roomCode = roomCode.toUpperCase();

    return { success: true };
}

function addPlayer(name) {
    if (gameState.players.length >= 8) {
        return { success: false, error: 'Room is full (max 8 players)' };
    }

    gameState.players.push({
        name: name,
        avatar: getRandomAvatar(),
        isHost: false
    });

    return { success: true };
}

function removePlayer(index) {
    if (index >= 0 && index < gameState.players.length) {
        gameState.players.splice(index, 1);
    }
}

function canStartGame() {
    return gameState.players.length >= 3;
}

function startGame(options = {}) {
    if (!canStartGame()) {
        return { success: false, error: 'Need at least 3 players' };
    }

    // Pick random word/topic
    gameState.currentWordData = getRandomWordData();

    // Pick random impostor
    gameState.impostorIndex = Math.floor(Math.random() * gameState.players.length);

    // Handle Jester option (use passed option or keep existing setting)
    if (options.jesterEnabled !== undefined) {
        gameState.jesterEnabled = options.jesterEnabled;
    }

    // Handle game twist options
    if (options.noTopicReveal !== undefined) {
        gameState.noTopicReveal = options.noTopicReveal;
    }
    if (options.impostorHint !== undefined) {
        gameState.impostorHint = options.impostorHint;
    }

    // Pick Jester if enabled (must be different from imposter, need at least 4 players)
    if (gameState.jesterEnabled && gameState.players.length >= 4) {
        let jesterIndex;
        do {
            jesterIndex = Math.floor(Math.random() * gameState.players.length);
        } while (jesterIndex === gameState.impostorIndex);
        gameState.jesterIndex = jesterIndex;
    } else {
        gameState.jesterIndex = -1;
        // Disable jester if not enough players
        if (gameState.players.length < 4) {
            gameState.jesterEnabled = false;
        }
    }

    // Randomize turn order
    const turnOrder = shuffleArray([...Array(gameState.players.length).keys()]);
    gameState.currentPlayerIndex = 0;
    gameState.turnOrder = turnOrder;

    // Reset submissions and votes
    gameState.submittedWords = [];
    gameState.votes = {};
    gameState.revealPlayerIndex = 0;

    // Move to reveal phase
    gameState.phase = GamePhase.REVEAL;

    return { success: true };
}

function getPlayerRole(playerIndex) {
    if (playerIndex === gameState.impostorIndex) return 'impostor';
    if (playerIndex === gameState.jesterIndex) return 'jester';
    return 'crew';
}

function getPlayerInfo(playerIndex) {
    const isImpostor = playerIndex === gameState.impostorIndex;
    const isJester = playerIndex === gameState.jesterIndex;

    // Get a random hint for the impostor (only if impostorHint is enabled)
    const hints = gameState.currentWordData.hints || [];
    const randomHint = hints.length > 0 ? hints[Math.floor(Math.random() * hints.length)] : '???';

    // Determine what topic to show based on noTopicReveal setting
    // If noTopicReveal is true: crew/jester don't see topic
    // If noTopicReveal is false: everyone sees topic
    const showTopicToCrew = !gameState.noTopicReveal;

    // Determine if impostor gets a hint
    const giveImpostorHint = gameState.impostorHint;

    // Impostor: sees topic + hint (no word)
    // Crew/Jester: sees word, and topic only if noTopicReveal is false
    return {
        topic: isImpostor ? gameState.currentWordData.topic : (showTopicToCrew ? gameState.currentWordData.topic : null),
        word: isImpostor ? null : gameState.currentWordData.word,
        hint: (isImpostor && giveImpostorHint) ? randomHint : null,
        isImpostor: isImpostor,
        isJester: isJester,
        role: getPlayerRole(playerIndex),
        noTopicReveal: gameState.noTopicReveal,
        impostorHint: gameState.impostorHint
    };
}

function proceedFromReveal() {
    gameState.revealPlayerIndex++;

    if (gameState.revealPlayerIndex >= gameState.players.length) {
        // All players have seen their role, move to submission
        gameState.phase = GamePhase.SUBMISSION;
        gameState.currentPlayerIndex = 0;
    }
}

function submitWord(word) {
    const playerIndex = gameState.turnOrder[gameState.currentPlayerIndex];

    gameState.submittedWords.push({
        playerIndex: playerIndex,
        playerName: gameState.players[playerIndex].name,
        word: word.trim()
    });

    gameState.currentPlayerIndex++;

    // Check if all players have submitted
    if (gameState.currentPlayerIndex >= gameState.players.length) {
        gameState.phase = GamePhase.DISCUSSION;
    }
}

function getCurrentTurnPlayer() {
    if (gameState.currentPlayerIndex >= gameState.players.length) {
        return null;
    }
    const playerIndex = gameState.turnOrder[gameState.currentPlayerIndex];
    return {
        index: playerIndex,
        player: gameState.players[playerIndex]
    };
}

function proceedToVoting() {
    gameState.phase = GamePhase.VOTING;
    gameState.votes = {};
}

function castVote(voterIndex, suspectIndex) {
    gameState.votes[voterIndex] = suspectIndex;
}

function allVotesIn() {
    return Object.keys(gameState.votes).length >= gameState.players.length;
}

function tallyVotes() {
    const tally = {};

    for (const voterIndex in gameState.votes) {
        const suspectIndex = gameState.votes[voterIndex];
        // Skip votes (index -1) are not counted in the tally
        if (suspectIndex !== -1) {
            tally[suspectIndex] = (tally[suspectIndex] || 0) + 1;
        }
    }

    // Find player with most votes
    let maxVotes = 0;
    let votedOutIndex = -1;
    let tie = false;

    for (const playerIndex in tally) {
        if (tally[playerIndex] > maxVotes) {
            maxVotes = tally[playerIndex];
            votedOutIndex = parseInt(playerIndex);
            tie = false;
        } else if (tally[playerIndex] === maxVotes) {
            tie = true;
        }
    }

    return {
        tally: tally,
        votedOutIndex: tie ? -1 : votedOutIndex,
        tie: tie
    };
}

function getGameResults() {
    const voteResults = tallyVotes();
    const imposterCaught = voteResults.votedOutIndex === gameState.impostorIndex && !voteResults.tie;
    const jesterWins = gameState.jesterIndex >= 0 && voteResults.votedOutIndex === gameState.jesterIndex && !voteResults.tie;

    return {
        impostorIndex: gameState.impostorIndex,
        impostorName: gameState.players[gameState.impostorIndex].name,
        jesterIndex: gameState.jesterIndex,
        jesterName: gameState.jesterIndex >= 0 ? gameState.players[gameState.jesterIndex].name : null,
        jesterEnabled: gameState.jesterEnabled,
        jesterWins: jesterWins,
        secretWord: gameState.currentWordData.word,
        topic: gameState.currentWordData.topic,
        votedOutIndex: voteResults.votedOutIndex,
        votedOutName: voteResults.votedOutIndex >= 0 ? gameState.players[voteResults.votedOutIndex].name : null,
        impostorCaught: imposterCaught,
        tie: voteResults.tie,
        votesTally: voteResults.tally
    };
}

function proceedToResults() {
    gameState.phase = GamePhase.RESULTS;
}

function playAgain() {
    // Keep players, reset game
    const players = [...gameState.players];
    initGame();
    gameState.players = players;
    gameState.roomCode = generateRoomCode();
    gameState.phase = GamePhase.LOBBY;
}

// ==========================================
// AVATAR UTILITIES
// ==========================================
const AVATARS = ['lucide:user', 'lucide:smile', 'lucide:zap', 'lucide:star', 'lucide:heart', 'lucide:music', 'lucide:camera', 'lucide:sun', 'lucide:moon', 'lucide:cloud', 'lucide:umbrella', 'lucide:coffee', 'lucide:pizza', 'lucide:gift', 'lucide:rocket', 'lucide:ghost'];

function getRandomAvatar() {
    return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

// Export for use in HTML
window.GamePhase = GamePhase;
window.gameState = gameState;
window.AVATARS = AVATARS;
window.hostGame = hostGame;
window.joinGame = joinGame;
window.addPlayer = addPlayer;
window.removePlayer = removePlayer;
window.canStartGame = canStartGame;
window.startGame = startGame;
window.getPlayerInfo = getPlayerInfo;
window.proceedFromReveal = proceedFromReveal;
window.submitWord = submitWord;
window.getCurrentTurnPlayer = getCurrentTurnPlayer;
window.startTimer = startTimer;
window.stopTimer = stopTimer;
window.proceedToVoting = proceedToVoting;
window.castVote = castVote;
window.allVotesIn = allVotesIn;
window.tallyVotes = tallyVotes;
window.getGameResults = getGameResults;
window.proceedToResults = proceedToResults;
window.playAgain = playAgain;
window.initGame = initGame;

