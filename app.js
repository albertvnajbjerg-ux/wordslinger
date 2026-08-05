(() => {
    'use strict';

    // ========== STATE ==========
    let players = [];           // { name, time, extraTime, remaining, timesUp }
    let playerCount = 2;
    let settings = [];
    for (let i = 0; i < 6; i++) {
        settings.push({ name: 'Player ' + (i + 1), time: 15, extraTime: 2 });
    }

    let activePlayer = -1;      // player index with the blue / counting down
    let timer = null;
    let isRunning = false;
    let resetCount = 0;
    let resetTimeout = null;
    let toastTimer = null;

    // ========== DOM ==========
    const gameScreen = document.getElementById('game-screen');
    const zonesContainer = document.getElementById('zones-container');
    const settingsScreen = document.getElementById('settings-screen');
    const settingsBody = document.getElementById('player-settings');
    const countBtns = document.querySelectorAll('#settings-screen .count-btn');

    let zones = [];
    let timeEls = [];
    let nameEls = [];
    let hintEls = [];
    let upEls = [];

    // ========== HELPERS ==========
    function formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function aliveCount() {
        return players.filter(p => !p.timesUp).length;
    }

    function nextAlive(fromIdx) {
        for (let step = 1; step <= players.length; step++) {
            const i = (fromIdx + step) % players.length;
            if (!players[i].timesUp) return i;
        }
        return -1;
    }

    function showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
    }

    // ========== BUILD ZONES ==========
    // Layout: players sit around the phone/table.
    // Two sides face each other: top side (flipped, read from across) and
    // bottom side (normal). e.g. 6 players = 3 on top + 3 on bottom.
    // For 3+ players the zones are ordered so the blue passes CLOCKWISE
    // around the table: top-left -> top-right -> bottom-right -> bottom-left.
    function buildZones() {
        zonesContainer.innerHTML = '';
        zones = [];
        timeEls = [];
        nameEls = [];
        hintEls = [];
        upEls = [];
        gameScreen.dataset.count = playerCount;
        // Buttons face player 1's position: portrait = P1 at the bottom,
        // landscape = P1 at the top-left.
        document.querySelector('.center-buttons').dataset.dir =
            playerCount === 2 ? 'portrait' : 'landscape';

        const bottomCount = Math.ceil(playerCount / 2);
        const topCount = playerCount - bottomCount;

        // 2 players (portrait): Player 1 bottom (normal), Player 2 top (flipped).
        if (playerCount === 2) {
            const topSide = document.createElement('div');
            topSide.className = 'side';
            topSide.appendChild(makeZone(1, true));
            zonesContainer.appendChild(topSide);
            zonesContainer.appendChild(horizontalDivider());
            const bottomSide = document.createElement('div');
            bottomSide.className = 'side';
            bottomSide.appendChild(makeZone(0, false));
            zonesContainer.appendChild(bottomSide);
            return;
        }

        // 3+ players (landscape), clockwise order:
        // Top side (far side, flipped): P1..PtopCount, left -> right.
        // Bottom side (near side): Pn..P(bottomCount), left -> right.
        const topSide = document.createElement('div');
        topSide.className = 'side';
        for (let j = 0; j < topCount; j++) {
            if (j > 0) topSide.appendChild(verticalDivider());
            topSide.appendChild(makeZone(j, true));
        }
        zonesContainer.appendChild(topSide);

        zonesContainer.appendChild(horizontalDivider());

        const bottomSide = document.createElement('div');
        bottomSide.className = 'side';
        for (let j = 0; j < bottomCount; j++) {
            if (j > 0) bottomSide.appendChild(verticalDivider());
            bottomSide.appendChild(makeZone(playerCount - 1 - j, false));
        }
        zonesContainer.appendChild(bottomSide);
    }

    function verticalDivider() {
        const d = document.createElement('div');
        d.className = 'zone-divider zone-divider-vert';
        return d;
    }

    function horizontalDivider() {
        const d = document.createElement('div');
        d.className = 'zone-divider';
        return d;
    }

    function makeZone(playerIdx, flipped) {
        const zone = document.createElement('div');
        zone.className = 'player-zone';
        zone.innerHTML = `
            <div class="player-content${flipped ? ' flipped' : ''}">
                <div class="time-display"></div>
                <div class="player-name"></div>
                <div class="tap-hint">Tap to start</div>
                <div class="times-up hidden">Time's up!</div>
            </div>`;
        zone.addEventListener('click', () => tapZone(playerIdx));

        zones[playerIdx] = zone;
        timeEls[playerIdx] = zone.querySelector('.time-display');
        nameEls[playerIdx] = zone.querySelector('.player-name');
        hintEls[playerIdx] = zone.querySelector('.tap-hint');
        upEls[playerIdx] = zone.querySelector('.times-up');
        return zone;
    }

    // ========== GAME FLOW ==========
    function initGame() {
        players = [];
        for (let i = 0; i < playerCount; i++) {
            players.push({
                name: settings[i].name || 'Player ' + (i + 1),
                time: settings[i].time,
                extraTime: settings[i].extraTime,
                remaining: settings[i].time,
                timesUp: false
            });
        }
        activePlayer = -1;
        isRunning = false;
        stopTimer();
        buildZones();
        renderAll();
        setPlayIcon();
    }

    function renderAll() {
        for (let i = 0; i < playerCount; i++) {
            const p = players[i];
            timeEls[i].textContent = formatTime(p.remaining);
            nameEls[i].textContent = p.name;
            zones[i].classList.toggle('active', i === activePlayer && !p.timesUp);
            // Only show "Time's up!" on the out player's field
            timeEls[i].classList.toggle('hidden', p.timesUp);
            upEls[i].classList.toggle('hidden', !p.timesUp);

            if (p.timesUp) {
                hintEls[i].classList.add('hidden');
            } else {
                hintEls[i].classList.toggle('hidden', activePlayer !== -1);
                hintEls[i].textContent = 'Tap to start';
            }
        }
    }

    function startTimer() {
        stopTimer();
        isRunning = true;
        timer = setInterval(() => {
            if (activePlayer === -1 || !players[activePlayer]) return;
            const p = players[activePlayer];

            p.remaining--;
            if (p.remaining <= 0) {
                p.remaining = 0;
                p.timesUp = true;
                stopTimer();

                if (aliveCount() > 1) {
                    // The blue automatically jumps to the next player
                    activePlayer = nextAlive(activePlayer);
                    renderAll();
                    startTimer();
                    setPlayIcon();
                } else {
                    // Only one player left - blue moves to them, but no countdown
                    activePlayer = nextAlive(activePlayer);
                    renderAll();
                    setPlayIcon();
                }
                return;
            }
            timeEls[activePlayer].textContent = formatTime(p.remaining);
        }, 1000);
    }

    function stopTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        isRunning = false;
    }

    function setPlayIcon() {
        const started = activePlayer !== -1;
        const play = document.getElementById('icon-play');
        const pause = document.getElementById('icon-pause');
        // Show the pause icon when the game is running OR before it has
        // started, so the button never looks like a "start" button.
        const showPlay = started && !isRunning;
        play.classList.toggle('hidden', !showPlay);
        pause.classList.toggle('hidden', showPlay);
    }

    // ========== TAP HANDLING ==========
    function tapZone(z) {
        if (players[z].timesUp) return;

        if (activePlayer === -1) {
            // Start: the NEXT alive player's field becomes blue and counts down
            activePlayer = nextAlive(z);
            if (activePlayer === -1) return;
            players[activePlayer].remaining = players[activePlayer].time;
            renderAll();
            startTimer();
        } else if (activePlayer === z) {
            // The blue player answers correctly: get bonus, pass the blue on
            players[z].remaining += players[z].extraTime;
            activePlayer = nextAlive(z);
            if (activePlayer === -1) return;
            renderAll();
            startTimer();
        }
        setPlayIcon();
    }

    // ========== CENTER BUTTONS ==========
    document.getElementById('btn-play').addEventListener('click', (e) => {
        e.stopPropagation();
        if (activePlayer === -1) return;
        if (isRunning) {
            stopTimer();
        } else {
            startTimer();
        }
        setPlayIcon();
    });

    document.getElementById('btn-reset').addEventListener('click', (e) => {
        e.stopPropagation();
        resetCount++;
        if (resetCount === 1) {
            showToast('Tryk en gang mere for at genstarte');
            resetTimeout = setTimeout(() => { resetCount = 0; }, 2200);
        } else {
            clearTimeout(resetTimeout);
            resetCount = 0;
            initGame();
            showToast('Genstartet');
        }
    });

    document.getElementById('btn-settings').addEventListener('click', (e) => {
        e.stopPropagation();
        stopTimer();
        renderSettings();
        settingsScreen.classList.remove('hidden');
    });

    // ========== SETTINGS ==========
    countBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            playerCount = parseInt(btn.dataset.count, 10);
            countBtns.forEach(b => b.classList.toggle('active', b === btn));
            renderPlayerSettings();
        });
    });

    document.getElementById('settings-close').addEventListener('click', () => {
        settingsScreen.classList.add('hidden');
        renderAll();
        setPlayIcon();
    });

    document.getElementById('settings-save').addEventListener('click', () => {
        readSettingsFromDom();
        settingsScreen.classList.add('hidden');
        initGame();
    });

    function renderSettings() {
        countBtns.forEach(b => b.classList.toggle('active', parseInt(b.dataset.count, 10) === playerCount));
        renderPlayerSettings();
    }

    function renderPlayerSettings() {
        let html = '';
        for (let i = 0; i < playerCount; i++) {
            const s = settings[i];
            html += `
                <div class="player-entry" data-idx="${i}">
                    <input type="text" value="${s.name}" data-idx="${i}" class="p-name" placeholder="Player ${i + 1}">
                    <div class="time-row">
                        <div class="time-col">
                            <label>Time</label>
                            <div class="time-box">
                                <button class="time-btn" data-idx="${i}" data-type="time" data-dir="-1">&minus;</button>
                                <div class="time-value" data-idx="${i}" data-type="time">${formatTime(s.time)}</div>
                                <button class="time-btn" data-idx="${i}" data-type="time" data-dir="1">+</button>
                            </div>
                        </div>
                        <div class="time-col">
                            <label>Extra Time</label>
                            <div class="time-box">
                                <button class="time-btn" data-idx="${i}" data-type="extra" data-dir="-1">&minus;</button>
                                <div class="time-value" data-idx="${i}" data-type="extra">${formatTime(s.extraTime)}</div>
                                <button class="time-btn" data-idx="${i}" data-type="extra" data-dir="1">+</button>
                            </div>
                        </div>
                    </div>
                </div>`;
        }
        settingsBody.innerHTML = html;
        bindPlayerSettings();
    }

    function bindPlayerSettings() {
        settingsBody.querySelectorAll('.p-name').forEach(input => {
            input.addEventListener('input', () => {
                settings[parseInt(input.dataset.idx, 10)].name = input.value;
            });
        });
        settingsBody.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                const type = btn.dataset.type;
                const dir = parseInt(btn.dataset.dir, 10);
                const key = type === 'time' ? 'time' : 'extraTime';
                const step = type === 'time' ? 5 : 1;
                settings[idx][key] = Math.max(key === 'time' ? 5 : 0, settings[idx][key] + dir * step);
                const el = settingsBody.querySelector(`.time-value[data-idx="${idx}"][data-type="${type}"]`);
                el.textContent = formatTime(settings[idx][key]);
            });
        });
    }

    function readSettingsFromDom() {
        settingsBody.querySelectorAll('.p-name').forEach(input => {
            settings[parseInt(input.dataset.idx, 10)].name = input.value;
        });
    }

    // ========== INSTALL PROMPT ==========
    let deferredPrompt = window.__deferredPrompt;
    let installShown = false;

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.matchMedia('(display-mode: fullscreen)').matches ||
               window.matchMedia('(display-mode: minimal-ui)').matches ||
               (window.navigator && window.navigator.standalone === true);
    }

    function isIOS() {
        return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function updateInstallCard() {
        const btn = document.getElementById('install-btn');
        const text = document.getElementById('install-text');
        if (deferredPrompt) {
            text.textContent = 'Tryk på "Installer app" for at føje Wordslinger til din hjemmeskærm.';
            btn.classList.remove('hidden');
        } else if (isIOS()) {
            text.textContent = 'Tryk på Del-knappen (firkant med pil op) i din browser og vælg "Føj til hjemmeskærmen".';
            btn.classList.add('hidden');
        } else {
            text.textContent = 'Tryk på "Installer app" nedenfor, eller brug install-ikonet i din browsers adresselinje.';
            btn.classList.remove('hidden');
        }
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        window.__deferredPrompt = e;
        if (installShown) updateInstallCard();
    });

    function maybeShowInstallPrompt() {
        if (installShown || isStandalone()) return;
        installShown = true;
        updateInstallCard();
        document.getElementById('install-overlay').classList.remove('hidden');
    }

    document.getElementById('install-btn').addEventListener('click', async () => {
        if (!deferredPrompt) {
            showToast('Brug install-ikonet i din browsers adresselinje for at føje appen til din enhed.');
            return;
        }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('install-overlay').classList.add('hidden');
        }
        deferredPrompt = null;
    });

    document.getElementById('install-close').addEventListener('click', () => {
        document.getElementById('install-overlay').classList.add('hidden');
    });

    maybeShowInstallPrompt();

    // ========== START ==========
    initGame();
})();
