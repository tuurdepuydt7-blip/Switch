const socket = io();

let roomCode = null;
let myId = null;
let state = null;

socket.on("connect", () => {
    myId = socket.id;
});


function $(id) {
    return document.getElementById(id);
}


function showBots() {
    $("menu").classList.add("hidden");
    $("botMenu").classList.remove("hidden");
}


function showOnline() {
    $("menu").classList.add("hidden");
    $("onlineMenu").classList.remove("hidden");
}


function backToMenu() {
    $("botMenu").classList.add("hidden");
    $("onlineMenu").classList.add("hidden");
    $("menu").classList.remove("hidden");
}


function playerName() {
    return $("name").value.trim() || "Speler";
}


function startBots(amount) {
    socket.emit("createRoom", {
        name: playerName(),
        bots: amount
    });
}


function createOnlineRoom() {
    socket.emit("createRoom", {
        name: playerName(),
        bots: 0
    });
}


function joinRoom() {
    const code =
        $("room").value.trim().toUpperCase();

    if (!code) return;

    socket.emit("joinRoom", {
        code,
        name: playerName()
    });
}


socket.on("roomCreated", code => {
    roomCode = code;

    $("menu").classList.add("hidden");
    $("botMenu").classList.add("hidden");
    $("onlineMenu").classList.add("hidden");

    $("game").classList.remove("hidden");

    $("roomCode").textContent = code;
});


socket.on("gameState", newState => {
    state = newState;

    if (state.started) {
        $("menu").classList.add("hidden");
        $("botMenu").classList.add("hidden");
        $("onlineMenu").classList.add("hidden");
        $("game").classList.remove("hidden");
    }

    render();
});


socket.on("errorMessage", message => {
    alert(message);
});


function render() {
    if (!state) return;

    renderOpponents();
    renderTopCard();
    renderHand();

    $("currentColor").textContent =
        state.currentColor || "-";

    if (state.winner) {
        $("winner").classList.remove("hidden");

        $("winnerText").textContent =
            `🏆 ${state.winner} heeft gewonnen!`;
    }

    const myTurn =
        state.currentPlayer === myId;

    $("drawButton").disabled =
        !myTurn || Boolean(state.winner);
}


function renderOpponents() {

    const container = $("opponents");

    container.innerHTML = "";

    for (const player of state.players) {

        const div =
            document.createElement("div");

        div.className = "opponent";

        if (player.id === state.currentPlayer) {
            div.classList.add("active");
        }

        if (player.id === myId) {
            div.innerHTML =
                `🧑 ${escapeHtml(player.name)}
                 — ${player.cards} kaarten`;
        } else {
            div.innerHTML =
                `${player.isBot ? "🤖" : "🧑"}
                 ${escapeHtml(player.name)}
                 — ${player.cards} kaarten`;
        }

        container.appendChild(div);
    }
}


function renderTopCard() {

    const card = state.topCard;

    const element = $("topCard");

    element.className =
        "card " + getCardClass(card);

    element.textContent =
        cardText(card);
}


function renderHand() {

    const container = $("hand");

    container.innerHTML = "";

    state.hand.forEach((card, index) => {

        const element =
            document.createElement("div");

        element.className =
            "hand-card " +
            getCardClass(card);

        element.textContent =
            cardText(card);

        const playable =
            isPlayable(card);

        if (!playable) {
            element.style.opacity = ".45";
            element.style.cursor = "not-allowed";
        }

        element.onclick = () => {

            if (!playable) return;

            socket.emit("playCard", {
                code: roomCode,
                index
            });
        };

        container.appendChild(element);
    });
}


function isPlayable(card) {

    if (!state) return false;

    if (state.currentPlayer !== myId) {
        return false;
    }

    if (
        card.type === "wild" ||
        card.type === "switch" ||
        card.type === "skip" ||
        card.type === "draw2" ||
        card.type === "mirror" ||
        card.type === "boom" ||
        card.type === "steal"
    ) {
        return true;
    }

    return (
        card.color === state.currentColor ||
        card.value === state.topCard.value
    );
}


function drawCard() {

    if (!roomCode) return;

    socket.emit("drawCard", {
        code: roomCode
    });
}


function getCardClass(card) {

    if (card.color) {
        return card.color;
    }

    return "special";
}


function cardText(card) {

    if (card.type === "number") {
        return card.value;
    }

    const names = {
        switch: "🔄",
        skip: "⏭️",
        draw2: "+2",
        wild: "🎨",
        mirror: "👀",
        boom: "💥",
        steal: "🕵️"
    };

    return names[card.type] || "?";
}


function escapeHtml(text) {

    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
