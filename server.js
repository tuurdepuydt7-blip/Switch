const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = new Map();

const COLORS = ["red", "blue", "green", "yellow"];

function createDeck() {
    const deck = [];

    for (const color of COLORS) {
        for (let n = 1; n <= 9; n++) {
            const amount = (n === 1 || n === 9) ? 1 : 2;

            for (let i = 0; i < amount; i++) {
                deck.push({
                    type: "number",
                    color,
                    value: n
                });
            }
        }
    }

    for (let i = 0; i < 4; i++) {
        deck.push({ type: "switch", color: null });
        deck.push({ type: "skip", color: null });
        deck.push({ type: "draw2", color: null });
        deck.push({ type: "wild", color: null });
        deck.push({ type: "mirror", color: null });
    }

    for (let i = 0; i < 2; i++) {
        deck.push({ type: "boom", color: null });
        deck.push({ type: "steal", color: null });
    }

    return shuffle(deck);
}

function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
}

function createPlayer(id, name, isBot = false) {
    return {
        id,
        name,
        isBot,
        hand: []
    };
}

function canPlay(card, topCard, currentColor) {
    if (card.type === "wild" ||
        card.type === "switch" ||
        card.type === "skip" ||
        card.type === "draw2" ||
        card.type === "mirror" ||
        card.type === "boom" ||
        card.type === "steal") {
        return true;
    }

    return (
        card.color === currentColor ||
        card.value === topCard.value
    );
}

function drawCard(room) {
    if (room.deck.length === 0) {
        const top = room.discard.pop();

        room.deck = shuffle(room.discard);
        room.discard = [top];
    }

    return room.deck.pop();
}

function broadcastRoom(room) {
    for (const player of room.players) {
        if (player.isBot) continue;

        io.to(player.id).emit("gameState", {
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                cards: p.hand.length,
                isBot: p.isBot
            })),
            hand: player.hand,
            topCard: room.discard[room.discard.length - 1],
            currentColor: room.currentColor,
            currentPlayer: room.players[room.turn].id,
            started: room.started,
            winner: room.winner
        });
    }
}

function nextTurn(room) {
    room.turn =
        (room.turn + 1) % room.players.length;

    broadcastRoom(room);

    const player = room.players[room.turn];

    if (player.isBot && !room.winner) {
        setTimeout(() => botTurn(room), 700);
    }
}

function finishIfNeeded(room, player) {
    if (player.hand.length === 0) {
        room.winner = player.name;
        broadcastRoom(room);
        return true;
    }

    return false;
}

function playCard(room, player, index) {
    if (room.players[room.turn] !== player) return;

    const card = player.hand[index];

    if (!card) return;

    const top = room.discard[room.discard.length - 1];

    if (!canPlay(card, top, room.currentColor)) {
        return;
    }

    player.hand.splice(index, 1);
    room.discard.push(card);

    if (card.color) {
        room.currentColor = card.color;
    }

    switch (card.type) {
        case "skip":
            room.turn =
                (room.turn + 2) % room.players.length;
            break;

        case "draw2": {
            const next =
                room.players[(room.turn + 1) % room.players.length];

            next.hand.push(drawCard(room));
            next.hand.push(drawCard(room));

            room.turn =
                (room.turn + 2) % room.players.length;
            break;
        }

        case "switch":
            switchHands(room);
            room.turn =
                (room.turn + 1) % room.players.length;
            break;

        case "mirror":
            room.turn =
                (room.turn + 1) % room.players.length;
            break;

        case "boom":
            boom(room);
            room.turn =
                (room.turn + 1) % room.players.length;
            break;

        case "steal":
            stealRandom(room, player);
            room.turn =
                (room.turn + 1) % room.players.length;
            break;

        default:
            room.turn =
                (room.turn + 1) % room.players.length;
    }

    if (card.type === "wild") {
        room.currentColor =
            COLORS[Math.floor(Math.random() * COLORS.length)];
    }

    if (finishIfNeeded(room, player)) return;

    broadcastRoom(room);

    const next = room.players[room.turn];

    if (next.isBot) {
        setTimeout(() => botTurn(room), 700);
    }
}

function switchHands(room) {
    const hands = room.players.map(p => p.hand);

    for (let i = 0; i < room.players.length; i++) {
        room.players[i].hand =
            hands[(i + 1) % hands.length];
    }
}

function boom(room) {
    const selected = [];

    for (const player of room.players) {
        if (player.hand.length > 0) {
            const index =
                Math.floor(Math.random() * player.hand.length);

            selected.push(player.hand.splice(index, 1)[0]);
        }
    }

    shuffle(selected);

    for (const player of room.players) {
        if (selected.length === 0) break;
        player.hand.push(selected.pop());
    }
}

function stealRandom(room, player) {
    const others =
        room.players.filter(p => p !== player && p.hand.length > 0);

    if (others.length === 0) return;

    const target =
        others[Math.floor(Math.random() * others.length)];

    const index =
        Math.floor(Math.random() * target.hand.length);

    const stolen = target.hand.splice(index, 1)[0];

    player.hand.push(stolen);
}

function botTurn(room) {
    if (room.winner) return;

    const bot = room.players[room.turn];

    if (!bot || !bot.isBot) return;

    const top =
        room.discard[room.discard.length - 1];

    const playable = bot.hand
        .map((card, index) => ({ card, index }))
        .filter(x =>
            canPlay(x.card, top, room.currentColor)
        );

    if (playable.length === 0) {
        const card = drawCard(room);

        if (card) bot.hand.push(card);

        broadcastRoom(room);

        nextTurn(room);
        return;
    }

    playable.sort((a, b) => {
        return bot.hand.filter(c => c.color === b.card.color).length -
               bot.hand.filter(c => c.color === a.card.color).length;
    });

    const chosen = playable[0];

    playCard(room, bot, chosen.index);
}

function startGame(room) {
    room.deck = createDeck();
    room.discard = [];
    room.currentColor = null;
    room.turn = 0;
    room.started = true;
    room.winner = null;

    for (const player of room.players) {
        player.hand = [];

        for (let i = 0; i < 7; i++) {
            player.hand.push(drawCard(room));
        }
    }

    let first = drawCard(room);

    while (
        first.type !== "number"
    ) {
        room.deck.unshift(first);
        first = drawCard(room);
    }

    room.discard.push(first);
    room.currentColor = first.color;

    broadcastRoom(room);
}

io.on("connection", socket => {

    socket.on("createRoom", ({ name, bots }) => {
        const code =
            Math.random()
                .toString(36)
                .substring(2, 6)
                .toUpperCase();

        const room = {
            code,
            players: [],
            deck: [],
            discard: [],
            currentColor: null,
            turn: 0,
            started: false,
            winner: null
        };

        room.players.push(
            createPlayer(socket.id, name || "Speler")
        );

        for (let i = 0; i < Number(bots); i++) {
            room.players.push(
                createPlayer(
                    `bot-${i}-${Date.now()}`,
                    `Bot ${i + 1}`,
                    true
                )
            );
        }

        rooms.set(code, room);

        socket.join(code);

        socket.emit("roomCreated", code);

        startGame(room);
    });

    socket.on("joinRoom", ({ code, name }) => {
        const room = rooms.get(code);

        if (!room) {
            socket.emit("errorMessage", "Room bestaat niet.");
            return;
        }

        if (room.players.length >= 6) {
            socket.emit("errorMessage", "Deze room zit vol.");
            return;
        }

        if (room.started) {
            socket.emit("errorMessage", "Het spel is al gestart.");
            return;
        }

        room.players.push(
            createPlayer(
                socket.id,
                name || `Speler ${room.players.length + 1}`
            )
        );

        socket.join(code);

        broadcastRoom(room);
    });

    socket.on("playCard", ({ code, index }) => {
        const room = rooms.get(code);

        if (!room || room.winner) return;

        const player =
            room.players.find(p => p.id === socket.id);

        if (!player) return;

        playCard(room, player, index);
    });

    socket.on("drawCard", ({ code }) => {
        const room = rooms.get(code);

        if (!room || room.winner) return;

        const player =
            room.players.find(p => p.id === socket.id);

        if (!player) return;

        if (room.players[room.turn] !== player) return;

        const card = drawCard(room);

        if (card) player.hand.push(card);

        nextTurn(room);
    });

    socket.on("startGame", code => {
        const room = rooms.get(code);

        if (!room) return;

        if (!room.started) {
            startGame(room);
        }
    });

    socket.on("disconnect", () => {
        for (const [code, room] of rooms) {
            room.players =
                room.players.filter(p => p.id !== socket.id);

            if (room.players.length === 0) {
                rooms.delete(code);
            } else {
                broadcastRoom(room);
            }
        }
    });
});

server.listen(3000, () => {
    console.log("SWITCH draait op http://localhost:3000");
});
