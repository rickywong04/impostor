// Imposter Game - Firebase Client
// Firebase Realtime Database for multiplayer sync
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyDjgkonDsC6TyhFaOKouEpD4k0lYZO66gA",
    authDomain: "imposter-d21d4.firebaseapp.com",
    projectId: "imposter-d21d4",
    storageBucket: "imposter-d21d4.firebasestorage.app",
    messagingSenderId: "180455128874",
    appId: "1:180455128874:web:5fc2b602631aa89af5e853",
    measurementId: "G-7TQR8XRWLZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
let database, auth;
let currentUserId = null;
let currentRoomCode = null;
let roomListener = null;

function initFirebase() {
    if (app) return;

    try {
        app = firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        auth = firebase.auth();

        // Sign in anonymously to get a user ID
        auth.signInAnonymously().then((result) => {
            currentUserId = result.user.uid;
            console.log('Firebase: Signed in as', currentUserId);
            updateConnectionStatus(true);
        }).catch((error) => {
            console.error('Firebase auth error:', error);
            updateConnectionStatus(false);
        });
    } catch (error) {
        console.error('Firebase init error:', error);
        updateConnectionStatus(false);
    }
}

// ===========================================
// ROOM MANAGEMENT
// ===========================================

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

const AVATARS = ['😀', '😎', '🤠', '🥳', '😺', '🦊', '🐸', '🦉', '🐙', '🦋', '🌸', '⭐', '🔥', '💎', '🎮', '🎨'];

function getRandomAvatar() {
    return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

async function firebaseCreateRoom(playerName, callback) {
    if (!currentUserId) {
        callback({ success: false, error: 'Not connected' });
        return;
    }

    // Generate unique room code
    let code;
    let exists = true;
    while (exists) {
        code = generateRoomCode();
        const snapshot = await database.ref(`rooms/${code}`).once('value');
        exists = snapshot.exists();
    }

    const roomData = {
        code: code,
        hostId: currentUserId,
        phase: 'lobby',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: {
            [currentUserId]: {
                name: playerName,
                avatar: getRandomAvatar(),
                isHost: true,
                ready: false
            }
        }
    };

    try {
        await database.ref(`rooms/${code}`).set(roomData);
        currentRoomCode = code;

        // Set up room listener
        setupRoomListener(code);

        // Handle disconnect - remove player
        database.ref(`rooms/${code}/players/${currentUserId}`).onDisconnect().remove();

        callback({ success: true, roomCode: code });
    } catch (error) {
        console.error('Create room error:', error);
        callback({ success: false, error: error.message });
    }
}

async function firebaseJoinRoom(playerName, roomCode, callback) {
    if (!currentUserId) {
        callback({ success: false, error: 'Not connected' });
        return;
    }

    const code = roomCode.toUpperCase();

    try {
        const snapshot = await database.ref(`rooms/${code}`).once('value');

        if (!snapshot.exists()) {
            callback({ success: false, error: 'Room not found' });
            return;
        }

        const room = snapshot.val();

        if (room.phase !== 'lobby') {
            callback({ success: false, error: 'Game already in progress' });
            return;
        }

        const playerCount = room.players ? Object.keys(room.players).length : 0;
        if (playerCount >= 8) {
            callback({ success: false, error: 'Room is full' });
            return;
        }

        // Add player to room
        await database.ref(`rooms/${code}/players/${currentUserId}`).set({
            name: playerName,
            avatar: getRandomAvatar(),
            isHost: false,
            ready: false
        });

        currentRoomCode = code;

        // Set up room listener
        setupRoomListener(code);

        // Handle disconnect
        database.ref(`rooms/${code}/players/${currentUserId}`).onDisconnect().remove();

        callback({ success: true, roomCode: code });
    } catch (error) {
        console.error('Join room error:', error);
        callback({ success: false, error: error.message });
    }
}

function setupRoomListener(code) {
    if (roomListener) {
        roomListener();
    }

    const roomRef = database.ref(`rooms/${code}`);

    roomListener = roomRef.on('value', (snapshot) => {
        if (!snapshot.exists()) {
            console.log('Room deleted');
            return;
        }

        const room = snapshot.val();
        handleRoomUpdate(room);
    });
}

function handleRoomUpdate(room) {
    // Convert players object to array
    const playersArray = [];
    let myIndex = -1;

    if (room.players) {
        Object.entries(room.players).forEach(([id, player], index) => {
            playersArray.push({
                id: id,
                ...player
            });
            if (id === currentUserId) {
                myIndex = index;
            }
        });
    }

    // Update gameState
    gameState.players = playersArray;
    gameState.roomCode = room.code;
    gameState.myIndex = myIndex;

    // Check if we're the host
    gameState.isHost = room.hostId === currentUserId;

    // Handle phase changes
    if (room.phase === 'lobby') {
        if (typeof updatePlayerList === 'function') {
            updatePlayerList();
        }
    } else if (room.phase === 'reveal' && room.game) {
        handleGameStart(room);
    } else if (room.phase === 'submission' && room.game) {
        handleSubmissionPhase(room);
    } else if (room.phase === 'discussion' && room.game) {
        handleDiscussionPhase(room);
    } else if (room.phase === 'voting' && room.game) {
        handleVotingPhase(room);
    } else if (room.phase === 'results' && room.game) {
        handleResultsPhase(room);
    }
}

function handleGameStart(room) {
    const myIndex = gameState.myIndex;
    const isImposter = myIndex === room.game.imposterIndex;

    gameState.myTopic = room.game.topic;
    gameState.myWord = isImposter ? '???' : room.game.word;
    gameState.isImposter = isImposter;
    gameState.turnOrder = room.game.turnOrder || [];

    if (typeof showOnlineRevealScreen === 'function') {
        showOnlineRevealScreen({
            topic: room.game.topic,
            word: isImposter ? '???' : room.game.word,
            isImposter: isImposter,
            players: gameState.players,
            turnOrder: room.game.turnOrder,
            myIndex: myIndex
        });
    }
}

function handleSubmissionPhase(room) {
    gameState.submittedWords = room.game.submittedWords || [];
    const currentTurnIndex = room.game.currentPlayerIndex || 0;
    const turnOrder = room.game.turnOrder || [];

    if (typeof showOnlineSubmissionScreen === 'function') {
        showOnlineSubmissionScreen(turnOrder[currentTurnIndex]);
    }
}

function handleDiscussionPhase(room) {
    gameState.submittedWords = room.game.submittedWords || [];
    if (typeof showDiscussionScreen === 'function') {
        showDiscussionScreen();
    }
}

function handleVotingPhase(room) {
    if (typeof showOnlineVotingScreen === 'function') {
        showOnlineVotingScreen();
    }
}

function handleResultsPhase(room) {
    if (typeof showOnlineResultsScreen === 'function') {
        showOnlineResultsScreen(room.game.results);
    }
}

// ===========================================
// GAME ACTIONS
// ===========================================

const WORD_DATABASE = [
    { topic: "Breakfast Foods", word: "Pancakes" },
    { topic: "Pets", word: "Golden Retriever" },
    { topic: "Fruits", word: "Mango" },
    { topic: "Sports", word: "Tennis" },
    { topic: "Countries", word: "Japan" },
    { topic: "Movies", word: "Titanic" },
    { topic: "Vehicles", word: "Motorcycle" },
    { topic: "Desserts", word: "Cheesecake" },
    { topic: "Musical Instruments", word: "Saxophone" },
    { topic: "Furniture", word: "Recliner" },
    { topic: "Drinks", word: "Cappuccino" },
    { topic: "Occupations", word: "Firefighter" },
    { topic: "Clothing", word: "Tuxedo" },
];

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

async function firebaseStartGame(callback) {
    if (!currentRoomCode || !gameState.isHost) {
        callback({ success: false, error: 'Not authorized' });
        return;
    }

    if (gameState.players.length < 3) {
        callback({ success: false, error: 'Need at least 3 players' });
        return;
    }

    // Pick random word
    const wordData = WORD_DATABASE[Math.floor(Math.random() * WORD_DATABASE.length)];

    // Pick random imposter
    const imposterIndex = Math.floor(Math.random() * gameState.players.length);

    // Create turn order
    const turnOrder = shuffleArray([...Array(gameState.players.length).keys()]);

    const gameData = {
        topic: wordData.topic,
        word: wordData.word,
        imposterIndex: imposterIndex,
        turnOrder: turnOrder,
        currentPlayerIndex: 0,
        submittedWords: [],
        votes: {}
    };

    try {
        await database.ref(`rooms/${currentRoomCode}/game`).set(gameData);
        await database.ref(`rooms/${currentRoomCode}/phase`).set('reveal');
        callback({ success: true });
    } catch (error) {
        callback({ success: false, error: error.message });
    }
}

async function firebasePlayerReady() {
    if (!currentRoomCode || !currentUserId) return;

    await database.ref(`rooms/${currentRoomCode}/players/${currentUserId}/ready`).set(true);

    // Check if all players ready (host does this check)
    if (gameState.isHost) {
        const snapshot = await database.ref(`rooms/${currentRoomCode}/players`).once('value');
        const players = snapshot.val();
        const allReady = Object.values(players).every(p => p.ready);

        if (allReady) {
            await database.ref(`rooms/${currentRoomCode}/phase`).set('submission');
        }
    }
}

async function firebaseSubmitWord(word) {
    if (!currentRoomCode) return;

    const snapshot = await database.ref(`rooms/${currentRoomCode}/game`).once('value');
    const game = snapshot.val();

    const submittedWords = game.submittedWords || [];
    submittedWords.push({
        playerIndex: gameState.myIndex,
        playerName: gameState.players[gameState.myIndex].name,
        word: word
    });

    const nextPlayerIndex = (game.currentPlayerIndex || 0) + 1;

    await database.ref(`rooms/${currentRoomCode}/game/submittedWords`).set(submittedWords);
    await database.ref(`rooms/${currentRoomCode}/game/currentPlayerIndex`).set(nextPlayerIndex);

    // Check if all submitted
    if (nextPlayerIndex >= gameState.players.length) {
        await database.ref(`rooms/${currentRoomCode}/phase`).set('discussion');
    }
}

async function firebaseProceedToVoting() {
    if (!currentRoomCode || !gameState.isHost) return;
    await database.ref(`rooms/${currentRoomCode}/phase`).set('voting');
}

async function firebaseCastVote(suspectIndex) {
    if (!currentRoomCode) return;

    await database.ref(`rooms/${currentRoomCode}/game/votes/${currentUserId}`).set(suspectIndex);

    // Check if all votes are in (host does this)
    if (gameState.isHost) {
        const snapshot = await database.ref(`rooms/${currentRoomCode}/game/votes`).once('value');
        const votes = snapshot.val() || {};

        if (Object.keys(votes).length >= gameState.players.length) {
            // Tally votes
            const tally = {};
            Object.values(votes).forEach(suspectIdx => {
                tally[suspectIdx] = (tally[suspectIdx] || 0) + 1;
            });

            let maxVotes = 0;
            let votedOutIndex = -1;
            let tie = false;

            for (const idx in tally) {
                if (tally[idx] > maxVotes) {
                    maxVotes = tally[idx];
                    votedOutIndex = parseInt(idx);
                    tie = false;
                } else if (tally[idx] === maxVotes) {
                    tie = true;
                }
            }

            const gameSnapshot = await database.ref(`rooms/${currentRoomCode}/game`).once('value');
            const game = gameSnapshot.val();

            const results = {
                imposterIndex: game.imposterIndex,
                imposterName: gameState.players[game.imposterIndex].name,
                secretWord: game.word,
                topic: game.topic,
                votedOutIndex: tie ? -1 : votedOutIndex,
                imposterCaught: votedOutIndex === game.imposterIndex && !tie,
                tie: tie,
                votesTally: tally
            };

            await database.ref(`rooms/${currentRoomCode}/game/results`).set(results);
            await database.ref(`rooms/${currentRoomCode}/phase`).set('results');
        }
    }
}

async function firebasePlayAgain() {
    if (!currentRoomCode || !gameState.isHost) return;

    // Reset player ready states
    const updates = {};
    gameState.players.forEach(player => {
        updates[`players/${player.id}/ready`] = false;
    });
    updates['phase'] = 'lobby';
    updates['game'] = null;

    await database.ref(`rooms/${currentRoomCode}`).update(updates);
}

// UI helper
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connection-status');
    if (indicator) {
        if (connected) {
            indicator.classList.remove('bg-red-500');
            indicator.classList.add('bg-green-500');
            indicator.title = 'Connected to Firebase';
        } else {
            indicator.classList.remove('bg-green-500');
            indicator.classList.add('bg-red-500');
            indicator.title = 'Disconnected';
        }
    }
}

// Export functions
window.initSocket = initFirebase; // Keep same name for compatibility
window.socketCreateRoom = firebaseCreateRoom;
window.socketJoinRoom = firebaseJoinRoom;
window.socketStartGame = firebaseStartGame;
window.socketPlayerReady = firebasePlayerReady;
window.socketSubmitWord = firebaseSubmitWord;
window.socketProceedToVoting = firebaseProceedToVoting;
window.socketCastVote = firebaseCastVote;
window.socketPlayAgain = firebasePlayAgain;
window.isConnected = () => !!currentUserId;
