// Imposter Game - Multiplayer Server
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Room storage
const rooms = new Map();

// Word database (same as client)
const WORD_DATABASE = [
    { topic: "Breakfast Foods", word: "Pancakes" },
    { topic: "Breakfast Foods", word: "Scrambled Eggs" },
    { topic: "Pets", word: "Golden Retriever" },
    { topic: "Pets", word: "Siamese Cat" },
    { topic: "Fruits", word: "Mango" },
    { topic: "Fruits", word: "Pomegranate" },
    { topic: "Sports", word: "Tennis" },
    { topic: "Sports", word: "Ice Hockey" },
    { topic: "Countries", word: "Japan" },
    { topic: "Countries", word: "Brazil" },
    { topic: "Movies", word: "Titanic" },
    { topic: "Movies", word: "The Lion King" },
    { topic: "Vehicles", word: "Motorcycle" },
    { topic: "Vehicles", word: "Submarine" },
    { topic: "Desserts", word: "Cheesecake" },
    { topic: "Desserts", word: "Tiramisu" },
    { topic: "Musical Instruments", word: "Saxophone" },
    { topic: "Musical Instruments", word: "Violin" },
    { topic: "Furniture", word: "Recliner" },
    { topic: "Furniture", word: "Bookshelf" },
    { topic: "Drinks", word: "Cappuccino" },
    { topic: "Drinks", word: "Lemonade" },
    { topic: "Occupations", word: "Firefighter" },
    { topic: "Occupations", word: "Architect" },
    { topic: "Clothing", word: "Tuxedo" },
    { topic: "Clothing", word: "Sneakers" },
];

const AVATARS = ['😀', '😎', '🤠', '🥳', '😺', '🦊', '🐸', '🦉', '🐙', '🦋', '🌸', '⭐', '🔥', '💎', '🎮', '🎨'];

// Utility functions
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function getRandomAvatar(usedAvatars = []) {
    const available = AVATARS.filter(a => !usedAvatars.includes(a));
    return available[Math.floor(Math.random() * available.length)] || AVATARS[0];
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

// Socket.io event handlers
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Create a new room
    socket.on('create-room', (playerName, callback) => {
        let code;
        do {
            code = generateRoomCode();
        } while (rooms.has(code));

        const room = {
            code,
            hostId: socket.id,
            players: [{
                id: socket.id,
                name: playerName,
                avatar: getRandomAvatar(),
                isHost: true
            }],
            gameState: {
                phase: 'lobby',
                currentWordData: null,
                imposterIndex: -1,
                turnOrder: [],
                currentPlayerIndex: 0,
                submittedWords: [],
                votes: {}
            }
        };

        rooms.set(code, room);
        socket.join(code);
        socket.roomCode = code;

        console.log(`Room ${code} created by ${playerName}`);
        callback({ success: true, roomCode: code, players: room.players });
    });

    // Join an existing room
    socket.on('join-room', (data, callback) => {
        const { playerName, roomCode } = data;
        const code = roomCode.toUpperCase();
        const room = rooms.get(code);

        if (!room) {
            callback({ success: false, error: 'Room not found' });
            return;
        }

        if (room.players.length >= 8) {
            callback({ success: false, error: 'Room is full' });
            return;
        }

        if (room.gameState.phase !== 'lobby') {
            callback({ success: false, error: 'Game already in progress' });
            return;
        }

        const usedAvatars = room.players.map(p => p.avatar);
        const player = {
            id: socket.id,
            name: playerName,
            avatar: getRandomAvatar(usedAvatars),
            isHost: false
        };

        room.players.push(player);
        socket.join(code);
        socket.roomCode = code;

        console.log(`${playerName} joined room ${code}`);

        // Notify all players in the room
        io.to(code).emit('player-joined', { players: room.players });
        callback({ success: true, roomCode: code, players: room.players });
    });

    // Start the game
    socket.on('start-game', (callback) => {
        const code = socket.roomCode;
        const room = rooms.get(code);

        if (!room || room.hostId !== socket.id) {
            callback({ success: false, error: 'Not authorized' });
            return;
        }

        if (room.players.length < 3) {
            callback({ success: false, error: 'Need at least 3 players' });
            return;
        }

        // Setup game
        room.gameState.currentWordData = getRandomWordData();
        room.gameState.imposterIndex = Math.floor(Math.random() * room.players.length);
        room.gameState.turnOrder = shuffleArray([...Array(room.players.length).keys()]);
        room.gameState.currentPlayerIndex = 0;
        room.gameState.submittedWords = [];
        room.gameState.votes = {};
        room.gameState.phase = 'reveal';

        console.log(`Game started in room ${code}. Imposter: ${room.players[room.gameState.imposterIndex].name}`);

        // Send personalized game state to each player
        room.players.forEach((player, index) => {
            const isImposter = index === room.gameState.imposterIndex;
            const personalState = {
                phase: 'reveal',
                topic: room.gameState.currentWordData.topic,
                word: isImposter ? '???' : room.gameState.currentWordData.word,
                isImposter,
                players: room.players,
                turnOrder: room.gameState.turnOrder,
                myIndex: index
            };
            io.to(player.id).emit('game-started', personalState);
        });

        callback({ success: true });
    });

    // Player ready (seen their role)
    socket.on('player-ready', () => {
        const code = socket.roomCode;
        const room = rooms.get(code);
        if (!room) return;

        // Track ready state
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex >= 0) {
            room.players[playerIndex].ready = true;
        }

        // Check if all players are ready
        const allReady = room.players.every(p => p.ready);
        if (allReady) {
            room.gameState.phase = 'submission';
            io.to(code).emit('phase-change', {
                phase: 'submission',
                currentTurnIndex: room.gameState.turnOrder[0],
                submittedWords: []
            });
        }
    });

    // Submit word
    socket.on('submit-word', (word) => {
        const code = socket.roomCode;
        const room = rooms.get(code);
        if (!room || room.gameState.phase !== 'submission') return;

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        const expectedIndex = room.gameState.turnOrder[room.gameState.currentPlayerIndex];

        if (playerIndex !== expectedIndex) return; // Not their turn

        room.gameState.submittedWords.push({
            playerIndex,
            playerName: room.players[playerIndex].name,
            word: word.trim()
        });

        room.gameState.currentPlayerIndex++;

        if (room.gameState.currentPlayerIndex >= room.players.length) {
            // Move to discussion
            room.gameState.phase = 'discussion';
            io.to(code).emit('phase-change', {
                phase: 'discussion',
                submittedWords: room.gameState.submittedWords
            });
        } else {
            // Next player's turn
            io.to(code).emit('word-submitted', {
                submittedWords: room.gameState.submittedWords,
                currentTurnIndex: room.gameState.turnOrder[room.gameState.currentPlayerIndex]
            });
        }
    });

    // Proceed to voting (host only)
    socket.on('proceed-to-voting', () => {
        const code = socket.roomCode;
        const room = rooms.get(code);
        if (!room || room.hostId !== socket.id) return;

        room.gameState.phase = 'voting';
        room.gameState.votes = {};
        io.to(code).emit('phase-change', { phase: 'voting' });
    });

    // Cast vote
    socket.on('cast-vote', (suspectIndex) => {
        const code = socket.roomCode;
        const room = rooms.get(code);
        if (!room || room.gameState.phase !== 'voting') return;

        const voterIndex = room.players.findIndex(p => p.id === socket.id);
        if (voterIndex < 0) return;

        room.gameState.votes[voterIndex] = suspectIndex;

        // Check if all votes are in
        if (Object.keys(room.gameState.votes).length >= room.players.length) {
            // Tally votes
            const tally = {};
            for (const idx in room.gameState.votes) {
                const suspect = room.gameState.votes[idx];
                tally[suspect] = (tally[suspect] || 0) + 1;
            }

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

            const imposterCaught = votedOutIndex === room.gameState.imposterIndex && !tie;

            room.gameState.phase = 'results';
            io.to(code).emit('game-results', {
                imposterIndex: room.gameState.imposterIndex,
                imposterName: room.players[room.gameState.imposterIndex].name,
                secretWord: room.gameState.currentWordData.word,
                topic: room.gameState.currentWordData.topic,
                votedOutIndex: tie ? -1 : votedOutIndex,
                imposterCaught,
                tie,
                votesTally: tally
            });
        } else {
            io.to(code).emit('vote-update', {
                votesReceived: Object.keys(room.gameState.votes).length,
                totalPlayers: room.players.length
            });
        }
    });

    // Play again
    socket.on('play-again', () => {
        const code = socket.roomCode;
        const room = rooms.get(code);
        if (!room || room.hostId !== socket.id) return;

        // Reset game state
        room.gameState = {
            phase: 'lobby',
            currentWordData: null,
            imposterIndex: -1,
            turnOrder: [],
            currentPlayerIndex: 0,
            submittedWords: [],
            votes: {}
        };
        room.players.forEach(p => p.ready = false);

        io.to(code).emit('game-reset', { players: room.players });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        const code = socket.roomCode;
        if (!code) return;

        const room = rooms.get(code);
        if (!room) return;

        // Remove player from room
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex >= 0) {
            const player = room.players[playerIndex];
            room.players.splice(playerIndex, 1);
            console.log(`${player.name} left room ${code}`);

            if (room.players.length === 0) {
                // Delete empty room
                rooms.delete(code);
                console.log(`Room ${code} deleted (empty)`);
            } else {
                // If host left, assign new host
                if (room.hostId === socket.id && room.players.length > 0) {
                    room.hostId = room.players[0].id;
                    room.players[0].isHost = true;
                }
                io.to(code).emit('player-left', {
                    players: room.players,
                    leftPlayerName: player.name
                });
            }
        }
    });
});

// Serve static files
app.use(express.static('.'));

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`\n🕵️  Imposter Game Server running on http://localhost:${PORT}\n`);
});
