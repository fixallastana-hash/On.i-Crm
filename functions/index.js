const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();
const db = admin.firestore();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const DEEPSEEK_API_KEY = defineSecret("DEEPSEEK_API_KEY");

// Лимиты на пользователя
const USER_DAILY_LIMIT = 50;      // запросов в день на одного пользователя
const MAX_PROMPT_CHARS = 8000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Лимит Gemini на весь проект (free tier = 1500/день, оставим запас)
const GEMINI_DAILY_LIMIT = 1400;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Проверка лимита пользователя
async function checkUserLimit(uid) {
  const dateKey = todayKey();
  const ref = db.collection("aiUsage").doc(uid).collection("days").doc(dateKey);
  const snap = await ref.get();
  const current = snap.exists ? (snap.data().count || 0) : 0;
  if (current >= USER_DAILY_LIMIT) {
    throw new HttpsError(
      "resource-exhausted",
      `Дневной лимит ${USER_DAILY_LIMIT} запросов исчерпан. Попробуйте завтра.`
    );
  }
  await ref.set(
    { count: current + 1, lastAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  return USER_DAILY_LIMIT - current - 1;
}

// Глобальный счётчик Gemini (на весь проект)
async function checkAndIncrementGemini() {
  const dateKey = todayKey();
  const ref = db.collection("aiGlobal").doc("gemini").collection("days").doc(dateKey);
  const snap = await ref.get();
  const current = snap.exists ? (snap.data().count || 0) : 0;
  if (current >= GEMINI_DAILY_LIMIT) {
    return { allowed: false, current };
  }
  await ref.set(
    { count: current + 1, lastAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { allowed: true, current: current + 1 };
}

async function callGemini(prompt, imageBase64, imageMime) {
  const key = GEMINI_API_KEY.value();
  if (!key) throw new Error("GEMINI_API_KEY не задан");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const genAI = new GoogleGenerativeAI(key);
  const m = genAI.getGenerativeModel({ model });

  const parts = [];
  if (imageBase64 && imageMime) {
    parts.push({ inlineData: { data: imageBase64, mimeType: imageMime } });
  }
  parts.push({ text: prompt });

  const result = await m.generateContent({ contents: [{ role: "user", parts }] });
  return result.response.text();
}

async function callDeepSeek(prompt) {
  const key = DEEPSEEK_API_KEY.value();
  if (!key) throw new Error("DEEPSEEK_API_KEY не задан");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const body = {
    model,
    stream: false,
    messages: [{ role: "user", content: prompt }]
  };
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("DeepSeek HTTP " + r.status + ": " + t.slice(0, 200));
  }
  const j = await r.json();
  return j.choices && j.choices[0] && j.choices[0].message
    ? j.choices[0].message.content
    : "";
}

exports.aiProxy = onCall(
  {
    secrets: [GEMINI_API_KEY, DEEPSEEK_API_KEY],
    memory: "512MiB",
    timeoutSeconds: 120,
    region: "us-central1"
  },
  async (req) => {
    if (!req.auth || !req.auth.uid) {
      throw new HttpsError("unauthenticated", "Требуется вход");
    }
    const uid = req.auth.uid;
    const provider = (req.data && req.data.provider) || "auto";
    const prompt = (req.data && req.data.prompt) || "";
    const imageBase64 = (req.data && req.data.imageBase64) || null;
    const imageMime = (req.data && req.data.imageMime) || null;

    if (!prompt || typeof prompt !== "string") {
      throw new HttpsError("invalid-argument", "Пустой prompt");
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      throw new HttpsError("invalid-argument", "Prompt слишком длинный");
    }
    if (imageBase64 && imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
      throw new HttpsError("invalid-argument", "Изображение слишком большое");
    }

    const userRemaining = await checkUserLimit(uid);

    // Если пользователь явно попросил Gemini / DeepSeek — не переключаем
    // Если "auto" — Gemini первый, DeepSeek fallback
    let usedProvider = null;
    let text = null;
    let fallbackReason = null;

    if (provider === "deepseek") {
      text = await callDeepSeek(prompt);
      usedProvider = "deepseek";
    } else if (provider === "gemini") {
      const g = await checkAndIncrementGemini();
      if (!g.allowed) {
        throw new HttpsError(
          "resource-exhausted",
          "Gemini дневной лимит проекта исчерпан. Переключитесь на DeepSeek."
        );
      }
      text = await callGemini(prompt, imageBase64, imageMime);
      usedProvider = "gemini";
    } else {
      // AUTO — Gemini первый, DeepSeek fallback
      // Но картинки — только Gemini (DeepSeek chat не принимает изображения)
      const hasImage = !!(imageBase64 && imageMime);

      const g = await checkAndIncrementGemini();
      if (g.allowed) {
        try {
          text = await callGemini(prompt, imageBase64, imageMime);
          usedProvider = "gemini";
        } catch (e) {
          const msg = (e && e.message) || "";
          console.warn("[aiProxy] Gemini failed:", msg);
          fallbackReason = "gemini-error";
          // Если картинка — DeepSeek не подойдёт
          if (hasImage) {
            throw new HttpsError("internal", "Gemini недоступен, а для фото нужен он: " + msg);
          }
        }
      } else {
        fallbackReason = "gemini-limit";
        console.log("[aiProxy] Gemini daily limit reached, falling back to DeepSeek");
      }

      // Fallback на DeepSeek
      if (!text) {
        if (hasImage) {
          throw new HttpsError(
            "resource-exhausted",
            "Gemini лимит исчерпан, для фото нужен он. Попробуйте позже."
          );
        }
        text = await callDeepSeek(prompt);
        usedProvider = "deepseek";
      }
    }

    return {
      ok: true,
      text: text,
      provider: usedProvider,
      remaining: userRemaining,
      fallback: fallbackReason
    };
  }
);

exports.aiUsage = onCall(
  { region: "us-central1" },
  async (req) => {
    if (!req.auth || !req.auth.uid) {
      throw new HttpsError("unauthenticated", "Требуется вход");
    }
    const dateKey = todayKey();
    const userRef = db.collection("aiUsage").doc(req.auth.uid)
      .collection("days").doc(dateKey);
    const userSnap = await userRef.get();
    const userUsed = userSnap.exists ? (userSnap.data().count || 0) : 0;

    const gemRef = db.collection("aiGlobal").doc("gemini")
      .collection("days").doc(dateKey);
    const gemSnap = await gemRef.get();
    const gemUsed = gemSnap.exists ? (gemSnap.data().count || 0) : 0;

    return {
      user: { used: userUsed, limit: USER_DAILY_LIMIT, remaining: USER_DAILY_LIMIT - userUsed },
      gemini: { used: gemUsed, limit: GEMINI_DAILY_LIMIT, remaining: Math.max(0, GEMINI_DAILY_LIMIT - gemUsed) }
    };
  }
);