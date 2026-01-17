// Impostor Game - Multiplayer Server
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { WORD_DATABASE } = require('./wordDatabase');

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

const AVATARS = ['lucide:user', 'lucide:smile', 'lucide:zap', 'lucide:star', 'lucide:heart', 'lucide:music', 'lucide:camera', 'lucide:sun', 'lucide:moon', 'lucide:cloud', 'lucide:umbrella', 'lucide:coffee', 'lucide:pizza', 'lucide:gift', 'lucide:rocket', 'lucide:ghost'];

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
                impostorIndex: -1,
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
    socket.on('start-game', (options, callback) => {
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

        // Handle game options with defaults
        const gameOptions = {
            jesterEnabled: options?.jesterEnabled || false,
            noTopicReveal: options?.noTopicReveal || false,
            impostorHint: options?.impostorHint !== false  // Default true
        };

        // Validate jester option (need 4+ players)
        if (gameOptions.jesterEnabled && room.players.length < 4) {
            gameOptions.jesterEnabled = false;
        }

        // Setup game
        room.gameState.currentWordData = getRandomWordData();
        room.gameState.impostorIndex = Math.floor(Math.random() * room.players.length);
        room.gameState.turnOrder = shuffleArray([...Array(room.players.length).keys()]);
        room.gameState.currentPlayerIndex = 0;
        room.gameState.submittedWords = [];
        room.gameState.votes = {};
        room.gameState.phase = 'reveal';
        room.gameState.options = gameOptions;

        // Handle Jester selection
        room.gameState.jesterIndex = -1;
        if (gameOptions.jesterEnabled && room.players.length >= 4) {
            let jesterIndex;
            do {
                jesterIndex = Math.floor(Math.random() * room.players.length);
            } while (jesterIndex === room.gameState.impostorIndex);
            room.gameState.jesterIndex = jesterIndex;
        }

        console.log(`Game started in room ${code}. Impostor: ${room.players[room.gameState.impostorIndex].name}, Options: ${JSON.stringify(gameOptions)}`);

        // Send personalized game state to each player
        const hints = room.gameState.currentWordData.hints || [];
        const randomHint = hints.length > 0 ? hints[Math.floor(Math.random() * hints.length)] : '???';

        // Determine what to show based on options
        const showTopicToCrew = !gameOptions.noTopicReveal;
        const giveImpostorHint = gameOptions.impostorHint;

        room.players.forEach((player, index) => {
            const isImpostor = index === room.gameState.impostorIndex;
            const isJester = index === room.gameState.jesterIndex;

            const personalState = {
                phase: 'reveal',
                // Impostor always sees topic; crew/jester see topic only if noTopicReveal is false
                topic: isImpostor ? room.gameState.currentWordData.topic : (showTopicToCrew ? room.gameState.currentWordData.topic : null),
                word: isImpostor ? null : room.gameState.currentWordData.word,
                // Impostor gets hint only if impostorHint is enabled
                hint: (isImpostor && giveImpostorHint) ? randomHint : null,
                isImpostor,
                isJester,
                players: room.players,
                turnOrder: room.gameState.turnOrder,
                myIndex: index,
                // Pass all options so client knows what mode we're in
                jesterEnabled: gameOptions.jesterEnabled,
                noTopicReveal: gameOptions.noTopicReveal,
                impostorHint: gameOptions.impostorHint
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
            console.log(`[player-ready] ${room.players[playerIndex].name} is ready in room ${code}`);
        }

        // Check if all players are ready
        const allReady = room.players.every(p => p.ready);
        console.log(`[player-ready] All ready: ${allReady}, Players: ${room.players.map(p => `${p.name}:${p.ready}`).join(', ')}`);

        if (allReady) {
            room.gameState.phase = 'submission';
            const firstTurnIndex = room.gameState.turnOrder[0];
            console.log(`[player-ready] All players ready! Starting submission phase. First turn: ${room.players[firstTurnIndex].name} (index ${firstTurnIndex})`);
            io.to(code).emit('phase-change', {
                phase: 'submission',
                currentTurnIndex: firstTurnIndex,
                submittedWords: []
            });
        }
    });

    // Submit word
    socket.on('submit-word', (word) => {
        const code = socket.roomCode;
        const room = rooms.get(code);
        console.log(`[submit-word] Room: ${code}, Word: ${word}, Phase: ${room?.gameState?.phase}`);

        if (!room || room.gameState.phase !== 'submission') {
            console.log(`[submit-word] Rejected - wrong phase or no room`);
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        const expectedIndex = room.gameState.turnOrder[room.gameState.currentPlayerIndex];

        console.log(`[submit-word] PlayerIndex: ${playerIndex}, ExpectedIndex: ${expectedIndex}, CurrentPlayerIndex: ${room.gameState.currentPlayerIndex}`);

        if (playerIndex !== expectedIndex) {
            console.log(`[submit-word] Rejected - not this player's turn`);
            return;
        }

        room.gameState.submittedWords.push({
            playerIndex,
            playerName: room.players[playerIndex].name,
            word: word.trim()
        });

        room.gameState.currentPlayerIndex++;
        console.log(`[submit-word] Word accepted. New currentPlayerIndex: ${room.gameState.currentPlayerIndex}`);

        if (room.gameState.currentPlayerIndex >= room.players.length) {
            // Move to discussion
            room.gameState.phase = 'discussion';
            console.log(`[submit-word] All players submitted. Moving to discussion phase.`);
            io.to(code).emit('phase-change', {
                phase: 'discussion',
                submittedWords: room.gameState.submittedWords
            });
        } else {
            // Next player's turn
            const nextTurnIndex = room.gameState.turnOrder[room.gameState.currentPlayerIndex];
            console.log(`[submit-word] Emitting word-submitted. NextTurnIndex: ${nextTurnIndex}`);
            io.to(code).emit('word-submitted', {
                submittedWords: room.gameState.submittedWords,
                currentTurnIndex: nextTurnIndex
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
            // Tally votes (excluding skip votes with index -1)
            const tally = {};
            for (const idx in room.gameState.votes) {
                const suspect = room.gameState.votes[idx];
                // Skip votes (index -1) are not counted in the tally
                if (suspect !== -1) {
                    tally[suspect] = (tally[suspect] || 0) + 1;
                }
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

            const impostorCaught = votedOutIndex === room.gameState.impostorIndex && !tie;

            room.gameState.phase = 'results';
            io.to(code).emit('game-results', {
                impostorIndex: room.gameState.impostorIndex,
                impostorName: room.players[room.gameState.impostorIndex].name,
                secretWord: room.gameState.currentWordData.word,
                topic: room.gameState.currentWordData.topic,
                votedOutIndex: tie ? -1 : votedOutIndex,
                impostorCaught,
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
            impostorIndex: -1,
            turnOrder: [],
            currentPlayerIndex: 0,
            submittedWords: [],
            votes: {}
        };
        room.players.forEach(p => p.ready = false);

        io.to(code).emit('game-reset', { players: room.players });
    });

    // Leave room explicitly
    socket.on('leave-room', () => {
        const code = socket.roomCode;
        if (!code) return;

        const room = rooms.get(code);
        if (!room) return;

        // Remove player from room
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex >= 0) {
            const player = room.players[playerIndex];
            room.players.splice(playerIndex, 1);
            socket.leave(code);
            socket.roomCode = null;
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

// Serve index.html with env variables injected
app.get('/', (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    // Inject environment variables (replace all occurrences)
    const gaId = process.env.GA_TRACKING_ID || '';
    const splineUrl = process.env.SPLINE_URL || '';

    html = html.replace(/\{\{GA_TRACKING_ID\}\}/g, gaId);
    html = html.replace(/\{\{SPLINE_URL\}\}/g, splineUrl);

    res.send(html);
});

// Serve static files
app.use(express.static('.'));

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`\nImpostor Game Server running on http://localhost:${PORT}\n`);
});
