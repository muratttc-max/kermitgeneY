const SESSION_KEY = "kermitgene-active-duel";

const state = {
  activeRace: null,
  selectedOpenRace: null,
  role: null,
  token: null,
  player: null,
  opponentName: "",
  bites: 0,
  tolerance: 0,
  finished: false,
  pendingSubmit: false
};

const els = {
  tabs: [...document.querySelectorAll(".tab")],
  panels: {
    race: document.querySelector("#race-panel"),
    history: document.querySelector("#history-panel")
  },
  registrationCard: document.querySelector("#registration-card"),
  registrationForm: document.querySelector("#registration-form"),
  formMessage: document.querySelector("#form-message"),
  joinCard: document.querySelector("#join-card"),
  joinForm: document.querySelector("#join-form"),
  joinTitle: document.querySelector("#join-title"),
  joinCopy: document.querySelector("#join-copy"),
  joinName: document.querySelector("#join-name"),
  joinMessage: document.querySelector("#join-message"),
  cancelJoin: document.querySelector("#cancel-join"),
  gameCard: document.querySelector("#game-card"),
  resultCard: document.querySelector("#result-card"),
  openRacesCard: document.querySelector("#open-races-card"),
  duelPlayer: document.querySelector("#duel-player"),
  duelOpponent: document.querySelector("#duel-opponent"),
  activePlayer: document.querySelector("#active-player"),
  biteCount: document.querySelector("#bite-count"),
  character: document.querySelector("#character"),
  face: document.querySelector("#face"),
  body: document.querySelector("#body"),
  wrap: document.querySelector("#wrap"),
  water: document.querySelector("#water"),
  heatFill: document.querySelector("#heat-fill"),
  meter: document.querySelector(".meter"),
  eatButton: document.querySelector("#eat-button"),
  gameMessage: document.querySelector("#game-message"),
  resultIcon: document.querySelector("#result-icon"),
  resultTag: document.querySelector("#result-tag"),
  resultTitle: document.querySelector("#result-title"),
  resultCopy: document.querySelector("#result-copy"),
  scoreComparison: document.querySelector("#score-comparison"),
  saveMessage: document.querySelector("#save-message"),
  raceAgain: document.querySelector("#race-again"),
  showOpenRaces: document.querySelector("#show-open-races"),
  showHistory: document.querySelector("#show-history"),
  refreshOpen: document.querySelector("#refresh-open"),
  openRacesList: document.querySelector("#open-races-list"),
  openMessage: document.querySelector("#open-message"),
  refreshHistory: document.querySelector("#refresh-history"),
  historyBody: document.querySelector("#history-body"),
  historyMessage: document.querySelector("#history-message"),
  totalRaces: document.querySelector("#total-races"),
  topScore: document.querySelector("#top-score")
};

const genderVisuals = {
  kadin: { face: "👩", body: "👚", label: "Kadın" },
  erkek: { face: "👨", body: "👕", label: "Erkek" }
};

function setMessage(element, text = "", type = "") {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function selectTab(tabName) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  Object.entries(els.panels).forEach(([name, panel]) => panel.classList.toggle("active", name === tabName));
  if (tabName === "history") loadHistory();
  if (tabName === "race") loadOpenRaces();
}

els.tabs.forEach((tab) => tab.addEventListener("click", () => selectTab(tab.dataset.tab)));

els.registrationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = String(data.get("name") || "").trim();
  const opponentName = String(data.get("opponentName") || "").trim();
  const gender = String(data.get("gender") || "");

  if (name.length < 2 || opponentName.length < 2 || !genderVisuals[gender]) {
    setMessage(els.formMessage, "Lütfen iki ismi de yaz ve kendi figürünü seç.", "error");
    return;
  }

  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setMessage(els.formMessage, "Meydan okuma hazırlanıyor…");

  try {
    const payload = await apiRequest({
      action: "create",
      name,
      opponentName,
      gender
    });
    beginGame(payload.race, payload.role, payload.token);
    loadOpenRaces();
  } catch (error) {
    setMessage(els.formMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

els.joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedOpenRace) return;

  const data = new FormData(event.currentTarget);
  const name = String(data.get("name") || "").trim();
  const gender = String(data.get("gender") || "");
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');

  submitButton.disabled = true;
  setMessage(els.joinMessage, "Yarışa katılım hazırlanıyor…");

  try {
    const payload = await apiRequest({
      action: "join",
      raceId: state.selectedOpenRace.id,
      name,
      gender
    });
    beginGame(payload.race, payload.role, payload.token);
    loadOpenRaces();
  } catch (error) {
    setMessage(els.joinMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

els.cancelJoin.addEventListener("click", () => {
  state.selectedOpenRace = null;
  els.joinForm.reset();
  els.joinCard.classList.add("hidden");
  els.registrationCard.classList.remove("hidden");
  els.openRacesCard.classList.remove("hidden");
  setMessage(els.joinMessage);
});

els.eatButton.addEventListener("click", () => {
  if (state.pendingSubmit) {
    submitCurrentScore();
    return;
  }
  if (state.finished) return;

  state.bites += 1;
  els.biteCount.textContent = String(state.bites);
  animateMunch();
  updateHeatDisplay();
  saveSession();

  if (state.bites >= state.tolerance) {
    finishTurn();
    return;
  }

  const heatPercent = Math.min(100, Math.round((state.bites / state.tolerance) * 100));
  if (heatPercent < 35) {
    els.gameMessage.textContent = "Gayet rahat gidiyor… Şimdilik!";
    els.face.textContent = genderVisuals[state.player.gender].face;
  } else if (heatPercent < 70) {
    els.gameMessage.textContent = "Acı kendini göstermeye başladı!";
    els.face.textContent = "😅";
  } else {
    els.gameMessage.textContent = "Ağzında küçük çaplı yangın var!";
    els.face.textContent = "🥵";
  }
});

function beginGame(race, role, token, saved = null) {
  const player = race[role];
  const opponent = role === "creator" ? race.opponent : race.creator;

  state.activeRace = race;
  state.role = role;
  state.token = token;
  state.player = { name: player.name, gender: player.gender };
  state.opponentName = opponent.name;
  state.bites = saved?.bites ?? 0;
  state.tolerance = saved?.tolerance ?? randomInt(7, 18);
  state.finished = false;
  state.pendingSubmit = false;

  els.duelPlayer.textContent = race.creator.name;
  els.duelOpponent.textContent = race.opponent.name;
  els.activePlayer.textContent = player.name;
  els.face.textContent = genderVisuals[player.gender]?.face || "🙂";
  els.body.textContent = genderVisuals[player.gender]?.body || "👕";
  els.biteCount.textContent = String(state.bites);
  els.water.classList.add("hidden");
  els.wrap.classList.remove("hidden");
  els.character.classList.remove("lost");
  els.eatButton.disabled = false;
  els.eatButton.textContent = "🌯 Bir Lokma Ye!";
  els.gameMessage.textContent = state.bites ? "Kaldığın lokmadan devam ediyorsun!" : "Hız önemli değil; yalnızca lokma sayısı önemli!";
  updateHeatDisplay();
  setMessage(els.formMessage);
  setMessage(els.joinMessage);
  setMessage(els.saveMessage);

  els.registrationCard.classList.add("hidden");
  els.joinCard.classList.add("hidden");
  els.resultCard.classList.add("hidden");
  els.openRacesCard.classList.add("hidden");
  els.gameCard.classList.remove("hidden");
  saveSession();
}

function animateMunch() {
  els.character.classList.remove("eating");
  void els.character.offsetWidth;
  els.character.classList.add("eating");
}

function updateHeatDisplay() {
  const heatPercent = state.tolerance
    ? Math.min(100, Math.round((state.bites / state.tolerance) * 100))
    : 0;
  els.heatFill.style.width = `${heatPercent}%`;
  els.meter.setAttribute("aria-valuenow", String(heatPercent));
}

async function finishTurn() {
  state.finished = true;
  state.pendingSubmit = true;
  els.eatButton.disabled = true;
  els.face.textContent = "🥵";
  els.character.classList.add("lost");
  els.wrap.classList.add("hidden");
  els.water.classList.remove("hidden");
  els.gameMessage.textContent = "SUYA UZANDI! Skor kaydediliyor…";
  saveSession();
  await delay(900);
  submitCurrentScore();
}

async function submitCurrentScore() {
  if (!state.pendingSubmit || !state.activeRace) return;

  els.eatButton.disabled = true;
  els.gameMessage.textContent = "Skor kaydediliyor…";

  try {
    const payload = await apiRequest({
      action: "submit-score",
      raceId: state.activeRace.id,
      token: state.token,
      score: state.bites
    });
    state.pendingSubmit = false;
    clearSession();
    showResult(payload.race);
    loadOpenRaces();
  } catch (error) {
    els.gameMessage.textContent = error.message;
    els.eatButton.disabled = false;
    els.eatButton.textContent = "Skoru Yeniden Kaydet";
  }
}

function showResult(race) {
  els.gameCard.classList.add("hidden");
  els.resultCard.classList.remove("hidden");
  els.openRacesCard.classList.remove("hidden");
  els.scoreComparison.replaceChildren();
  els.scoreComparison.classList.add("hidden");
  setMessage(els.saveMessage, "Skor başarıyla kaydedildi.", "success");

  if (race.status === "completed") {
    els.resultIcon.textContent = race.winner?.result === "tie" ? "🤝🌶️" : "🏆🌶️";
    els.resultTag.textContent = "Yarış tamamlandı";
    els.resultTitle.textContent = race.winner?.result === "tie"
      ? "Berabere kaldınız!"
      : `${race.winner?.name || "Kazanan"} kazandı!`;
    els.resultCopy.textContent = `${race.creator.name} ${race.creator.score} lokma, ${race.opponent.name} ${race.opponent.score} lokma yedi.`;
    renderScoreComparison(race);
  } else {
    els.resultIcon.textContent = "🥵🥤";
    els.resultTag.textContent = "Sıran tamamlandı";
    els.resultTitle.textContent = `${state.player.name} ${state.bites} lokmayla sırasını tamamladı!`;
    els.resultCopy.textContent = `${state.opponentName} da yarışını tamamladığında kazanan otomatik olarak belli olacak.`;
  }
}

function renderScoreComparison(race) {
  els.scoreComparison.classList.remove("hidden");

  const creator = createScorePerson(race.creator, race.winner?.role === "creator");
  const versus = document.createElement("strong");
  versus.className = "comparison-vs";
  versus.textContent = race.winner?.result === "tie" ? "=" : "VS";
  const opponent = createScorePerson(race.opponent, race.winner?.role === "opponent");

  els.scoreComparison.append(creator, versus, opponent);
}

function createScorePerson(person, winner) {
  const wrapper = document.createElement("div");
  wrapper.className = `score-person${winner ? " winner" : ""}`;

  const icon = document.createElement("span");
  icon.className = "score-person-icon";
  icon.textContent = winner ? "🏆" : genderVisuals[person.gender]?.face || "🙂";

  const name = document.createElement("strong");
  name.textContent = person.name;

  const score = document.createElement("span");
  score.textContent = `${person.score} lokma`;

  wrapper.append(icon, name, score);
  return wrapper;
}

els.raceAgain.addEventListener("click", resetRace);
els.showOpenRaces.addEventListener("click", () => {
  resetRace();
  els.openRacesCard.scrollIntoView({ behavior: "smooth", block: "start" });
});
els.showHistory.addEventListener("click", () => selectTab("history"));
els.refreshOpen.addEventListener("click", loadOpenRaces);
els.refreshHistory.addEventListener("click", loadHistory);

function resetRace() {
  state.activeRace = null;
  state.selectedOpenRace = null;
  state.role = null;
  state.token = null;
  state.player = null;
  state.opponentName = "";
  state.bites = 0;
  state.tolerance = 0;
  state.finished = false;
  state.pendingSubmit = false;
  clearSession();

  els.registrationForm.reset();
  els.joinForm.reset();
  els.resultCard.classList.add("hidden");
  els.gameCard.classList.add("hidden");
  els.joinCard.classList.add("hidden");
  els.registrationCard.classList.remove("hidden");
  els.openRacesCard.classList.remove("hidden");
  setMessage(els.formMessage);
  setMessage(els.joinMessage);
  document.querySelector("#player-name").focus();
  loadOpenRaces();
}

async function loadOpenRaces() {
  setMessage(els.openMessage, "Açık yarışlar yükleniyor…");
  els.refreshOpen.disabled = true;

  try {
    const payload = await apiGet();
    renderOpenRaces(payload.openRaces || []);
    setMessage(els.openMessage);
  } catch (error) {
    renderOpenRaces([]);
    setMessage(els.openMessage, error.message, "error");
  } finally {
    els.refreshOpen.disabled = false;
  }
}

function renderOpenRaces(races) {
  els.openRacesList.replaceChildren();

  if (!races.length) {
    const empty = document.createElement("div");
    empty.className = "empty-open";
    empty.textContent = "Şu anda bekleyen bir meydan okuma yok.";
    els.openRacesList.appendChild(empty);
    return;
  }

  races.forEach((race) => {
    const item = document.createElement("article");
    item.className = "open-race-item";

    const versus = document.createElement("div");
    versus.className = "open-versus";

    const creatorName = document.createElement("strong");
    creatorName.textContent = race.creator.name;
    const vs = document.createElement("span");
    vs.textContent = "VS";
    const opponentName = document.createElement("strong");
    opponentName.textContent = race.opponent.name;
    versus.append(creatorName, vs, opponentName);

    const details = document.createElement("div");
    details.className = "open-details";
    const creatorStatus = race.creator.finished ? "Sırasını tamamladı" : "Yarışını sürdürüyor";
    const opponentStatus = race.opponent.finished
      ? "Sırasını tamamladı"
      : race.opponent.joined
        ? "Yarışa katıldı"
        : "Katılımı bekleniyor";
    details.textContent = `${race.creator.name}: ${creatorStatus} · ${race.opponent.name}: ${opponentStatus}`;

    const footer = document.createElement("div");
    footer.className = "open-race-footer";
    const expiry = document.createElement("span");
    expiry.textContent = `${formatRemaining(race.expiresAt)} sonra iptal olur`;
    footer.appendChild(expiry);

    if (!race.opponent.joined) {
      const joinButton = document.createElement("button");
      joinButton.type = "button";
      joinButton.className = "primary-button compact-button";
      joinButton.textContent = `${race.opponent.name} olarak katıl`;
      joinButton.addEventListener("click", () => openJoinForm(race));
      footer.appendChild(joinButton);
    } else {
      const badge = document.createElement("span");
      badge.className = "status-badge";
      badge.textContent = "İki yarışmacı da katıldı";
      footer.appendChild(badge);
    }

    item.append(versus, details, footer);
    els.openRacesList.appendChild(item);
  });
}

function openJoinForm(race) {
  state.selectedOpenRace = race;
  els.joinTitle.textContent = `${race.opponent.name}, sıra sende!`;
  els.joinCopy.textContent = `${race.creator.name} seni acı çiğ köfte düellosuna çağırdı. Adını doğrula, figürünü seç ve yarışa başla.`;
  els.joinName.value = race.opponent.name;
  setMessage(els.joinMessage);

  els.registrationCard.classList.add("hidden");
  els.openRacesCard.classList.add("hidden");
  els.joinCard.classList.remove("hidden");
  els.joinCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadHistory() {
  setMessage(els.historyMessage, "Sonuçlar yükleniyor…");
  els.refreshHistory.disabled = true;

  try {
    const payload = await apiGet();
    renderHistory(payload.completedRaces || []);
    setMessage(els.historyMessage);
  } catch (error) {
    renderHistory([]);
    setMessage(els.historyMessage, error.message, "error");
  } finally {
    els.refreshHistory.disabled = false;
  }
}

function renderHistory(races) {
  els.historyBody.replaceChildren();
  els.totalRaces.textContent = String(races.length);
  const bestScore = races.reduce(
    (best, race) => Math.max(best, Number(race.creator.score) || 0, Number(race.opponent.score) || 0),
    0
  );
  els.topScore.textContent = `${bestScore} lokma`;

  if (!races.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "empty-row";
    cell.textContent = "Henüz tamamlanan bir düello yok.";
    row.appendChild(cell);
    els.historyBody.appendChild(row);
    return;
  }

  races.forEach((race) => {
    const row = document.createElement("tr");
    const date = document.createElement("td");
    date.textContent = formatDate(race.completedAt);

    const match = document.createElement("td");
    match.textContent = `${race.creator.name} vs ${race.opponent.name}`;

    const score = document.createElement("td");
    score.textContent = `${race.creator.score} - ${race.opponent.score}`;

    const winner = document.createElement("td");
    winner.textContent = race.winner?.result === "tie" ? "🤝 Berabere" : `🏆 ${race.winner?.name || "—"}`;
    if (race.winner?.result !== "tie") winner.className = "winner-cell";

    row.append(date, match, score, winner);
    els.historyBody.appendChild(row);
  });
}

async function apiGet() {
  const response = await fetch("/api/races", { headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Yarışlar alınamadı.");
  return payload;
}

async function apiRequest(body) {
  const response = await fetch("/api/races", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "İşlem tamamlanamadı.");
  return payload;
}

function saveSession() {
  if (!state.activeRace || !state.token || !state.player) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    race: state.activeRace,
    role: state.role,
    token: state.token,
    bites: state.bites,
    tolerance: state.tolerance,
    player: state.player,
    opponentName: state.opponentName,
    pendingSubmit: state.pendingSubmit,
    expiresAt: state.activeRace.expiresAt
  }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!saved?.race || !saved?.token || !saved?.role) return false;
    if (new Date(saved.expiresAt).getTime() <= Date.now()) {
      clearSession();
      return false;
    }

    beginGame(saved.race, saved.role, saved.token, saved);
    if (saved.pendingSubmit) {
      state.finished = true;
      state.pendingSubmit = true;
      els.face.textContent = "🥵";
      els.character.classList.add("lost");
      els.wrap.classList.add("hidden");
      els.water.classList.remove("hidden");
      els.eatButton.textContent = "Skoru Kaydet";
      els.gameMessage.textContent = "Yarışın bitti; skorunu kaydetmek için düğmeye bas.";
    }
    return true;
  } catch {
    clearSession();
    return false;
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatRemaining(value) {
  const remaining = Math.max(0, new Date(value).getTime() - Date.now());
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.max(1, Math.ceil((remaining % (60 * 60 * 1000)) / (60 * 1000)));
  return hours > 0 ? `${hours} saat ${minutes} dakika` : `${minutes} dakika`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

restoreSession();
loadOpenRaces();
