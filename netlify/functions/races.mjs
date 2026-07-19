import { getStore } from "@netlify/blobs";

const STORE_NAME = "kermitgene-aci-yarisi";
const RACE_PREFIX = "duels/";
const RACE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_RACES = 500;
const MAX_UPDATE_ATTEMPTS = 4;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function cleanName(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function comparableName(value) {
  return cleanName(value).normalize("NFKC").toLocaleLowerCase("tr-TR");
}

function normalizeGender(value) {
  return value === "kadin" || value === "erkek" ? value : null;
}

function normalizeScore(value) {
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 50 ? score : null;
}

function raceKey(id) {
  return `${RACE_PREFIX}${id}`;
}

function isExpired(race, now = Date.now()) {
  return race.status !== "completed" && new Date(race.expiresAt).getTime() <= now;
}

function publicRace(race) {
  const completed = race.status === "completed";
  return {
    id: race.id,
    status: race.status,
    createdAt: race.createdAt,
    expiresAt: race.expiresAt,
    completedAt: race.completedAt ?? null,
    winner: completed ? race.winner : null,
    creator: {
      name: race.creator.name,
      gender: race.creator.gender,
      joined: true,
      finished: Number.isInteger(race.creator.score),
      score: completed ? race.creator.score : null
    },
    opponent: {
      name: race.opponent.name,
      gender: race.opponent.gender,
      joined: Boolean(race.opponent.token),
      finished: Number.isInteger(race.opponent.score),
      score: completed ? race.opponent.score : null
    }
  };
}

function determineWinner(race) {
  if (race.creator.score > race.opponent.score) {
    return { role: "creator", name: race.creator.name, result: "winner" };
  }
  if (race.opponent.score > race.creator.score) {
    return { role: "opponent", name: race.opponent.name, result: "winner" };
  }
  return { role: "tie", name: null, result: "tie" };
}

async function listRaces(store) {
  const { blobs } = await store.list({ prefix: RACE_PREFIX });
  const newest = blobs.slice(-MAX_RACES);
  const entries = await Promise.all(
    newest.map(({ key }) => store.get(key, { type: "json", consistency: "strong" }))
  );

  const now = Date.now();
  const expired = [];
  const active = [];

  entries.filter(Boolean).forEach((race) => {
    if (isExpired(race, now)) expired.push(race);
    else active.push(race);
  });

  await Promise.allSettled(expired.map((race) => store.delete(raceKey(race.id))));

  const openRaces = active
    .filter((race) => race.status !== "completed")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicRace);

  const completedRaces = active
    .filter((race) => race.status === "completed")
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .map(publicRace);

  return { openRaces, completedRaces };
}

async function readRace(store, id) {
  return store.getWithMetadata(raceKey(id), { type: "json", consistency: "strong" });
}

async function updateRace(store, id, updater) {
  for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
    const entry = await readRace(store, id);
    if (!entry) return { error: "Yarış bulunamadı veya süresi doldu.", status: 404 };

    const race = entry.data;
    if (isExpired(race)) {
      await store.delete(raceKey(id));
      return { error: "Bu yarışın bir günlük katılım süresi dolmuş.", status: 410 };
    }

    const result = updater(structuredClone(race));
    if (result.error) return result;

    const write = await store.setJSON(raceKey(id), result.race, { onlyIfMatch: entry.etag });
    if (write.modified) return { race: result.race, extra: result.extra };
  }

  return { error: "Yarış aynı anda güncellendi. Lütfen tekrar dene.", status: 409 };
}

async function createRace(store, body) {
  const creatorName = cleanName(body.name);
  const opponentName = cleanName(body.opponentName);
  const creatorGender = normalizeGender(body.gender);

  if (creatorName.length < 2 || opponentName.length < 2) {
    return json({ error: "Her iki isim de en az 2 karakter olmalı." }, 400);
  }
  if (!creatorGender) return json({ error: "Kadın veya erkek figürü seçilmeli." }, 400);
  if (comparableName(creatorName) === comparableName(opponentName)) {
    return json({ error: "Kendine karşı yarışamazsın; farklı bir rakip yazmalısın." }, 400);
  }

  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + RACE_LIFETIME_MS);
  const race = {
    id,
    status: "open",
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    completedAt: null,
    winner: null,
    creator: {
      name: creatorName,
      gender: creatorGender,
      token,
      score: null,
      joinedAt: createdAt.toISOString(),
      finishedAt: null
    },
    opponent: {
      name: opponentName,
      gender: null,
      token: null,
      score: null,
      joinedAt: null,
      finishedAt: null
    }
  };

  const write = await store.setJSON(raceKey(id), race, { onlyIfNew: true });
  if (!write.modified) return json({ error: "Yarış oluşturulamadı. Lütfen tekrar dene." }, 409);
  return json({ race: publicRace(race), token, role: "creator" }, 201);
}

async function joinRace(store, body) {
  const id = String(body.raceId ?? "");
  const name = cleanName(body.name);
  const gender = normalizeGender(body.gender);

  if (!id) return json({ error: "Yarış seçilmedi." }, 400);
  if (name.length < 2) return json({ error: "İsim en az 2 karakter olmalı." }, 400);
  if (!gender) return json({ error: "Kadın veya erkek figürü seçilmeli." }, 400);

  const token = crypto.randomUUID();
  const updated = await updateRace(store, id, (race) => {
    if (race.status === "completed") return { error: "Bu yarış zaten tamamlandı.", status: 409 };
    if (comparableName(name) !== comparableName(race.opponent.name)) {
      return { error: `Bu yarış ${race.opponent.name} adına açılmış.`, status: 403 };
    }
    if (race.opponent.token) return { error: "Rakip bu yarışa zaten katılmış.", status: 409 };

    race.opponent.gender = gender;
    race.opponent.token = token;
    race.opponent.joinedAt = new Date().toISOString();
    return { race };
  });

  if (updated.error) return json({ error: updated.error }, updated.status);
  return json({ race: publicRace(updated.race), token, role: "opponent" });
}

async function submitScore(store, body) {
  const id = String(body.raceId ?? "");
  const token = String(body.token ?? "");
  const score = normalizeScore(body.score);

  if (!id || !token) return json({ error: "Yarış oturumu bulunamadı." }, 400);
  if (score === null) return json({ error: "Geçersiz lokma sayısı." }, 400);

  const updated = await updateRace(store, id, (race) => {
    if (race.status === "completed") return { error: "Bu yarış zaten tamamlandı.", status: 409 };

    const role = race.creator.token === token
      ? "creator"
      : race.opponent.token === token
        ? "opponent"
        : null;

    if (!role) return { error: "Bu yarış oturumu geçerli değil.", status: 403 };
    if (Number.isInteger(race[role].score)) {
      if (race[role].score === score) return { race, extra: { role } };
      return { error: "Bu yarışmacının skoru daha önce kaydedilmiş.", status: 409 };
    }

    race[role].score = score;
    race[role].finishedAt = new Date().toISOString();

    if (Number.isInteger(race.creator.score) && Number.isInteger(race.opponent.score)) {
      race.status = "completed";
      race.completedAt = new Date().toISOString();
      race.winner = determineWinner(race);
    }

    return { race, extra: { role } };
  });

  if (updated.error) return json({ error: updated.error }, updated.status);
  return json({ race: publicRace(updated.race), role: updated.extra.role });
}

export default async function handler(request) {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  try {
    if (request.method === "GET") {
      return json(await listRaces(store));
    }

    if (request.method === "POST") {
      const body = await request.json();
      if (body.action === "create") return createRace(store, body);
      if (body.action === "join") return joinRace(store, body);
      if (body.action === "submit-score") return submitScore(store, body);
      return json({ error: "Geçersiz işlem." }, 400);
    }

    return json({ error: "Bu yöntem desteklenmiyor." }, 405);
  } catch (error) {
    console.error("races function error", error);
    return json({ error: "Yarışlar işlenirken bir sorun oluştu." }, 500);
  }
}

export const config = {
  path: "/api/races"
};
