const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const DEEPSEEK_API_KEY = defineSecret("DEEPSEEK_API_KEY");
const GROQ_API_KEY = defineSecret("GROQ_API_KEY");
const CEREBRAS_API_KEY = defineSecret("CEREBRAS_API_KEY");
const OPENROUTER_API_KEY = defineSecret("OPENROUTER_API_KEY");

const USER_DAILY_LIMIT = 500;
const MAX_PROMPT_CHARS = 12000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Gemini модели в порядке приоритета (рабочие у ключа)
const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest"
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

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

function isRetryable(msg) {
  if (!msg) return false;
  const s = String(msg);
  return s.includes("429") || s.includes("404") || s.includes("500") || s.includes("503")
    || s.includes("quota") || s.includes("overloaded")
    || s.includes("RESOURCE_EXHAUSTED") || s.includes("NOT_FOUND")
    || s.includes("rate limit") || s.includes("timeout");
}

// ============ GEMINI ============
async function callGeminiModel(apiKey, model, prompt, imageBase64, imageMime) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const parts = [];
  if (imageBase64 && imageMime) {
    parts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
  }
  parts.push({ text: prompt });
  const body = {
    contents: [{ parts }],
    generationConfig: { response_mime_type: "application/json" }
  };
  // Для поиска (tools) нельзя response_mime_type
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("Gemini HTTP " + r.status + ": " + t.slice(0, 200));
  }
  const j = await r.json();
  const text = j && j.candidates && j.candidates[0] && j.candidates[0].content
    && j.candidates[0].content.parts && j.candidates[0].content.parts[0]
    ? (j.candidates[0].content.parts[0].text || "")
    : "";
  return text;
}

async function callGemini(prompt, imageBase64, imageMime) {
  const key = GEMINI_API_KEY.value();
  if (!key) throw new Error("GEMINI_API_KEY не задан");
  let lastErr = null;
  for (const model of GEMINI_MODELS) {
    try {
      const text = await callGeminiModel(key, model, prompt, imageBase64, imageMime);
      if (text && text.trim()) return { text, model };
      lastErr = new Error("Gemini пустой ответ от " + model);
    } catch (e) {
      const msg = (e && e.message) || "";
      if (isRetryable(msg)) { lastErr = e; continue; }
      throw e;
    }
  }
  throw lastErr || new Error("Все модели Gemini недоступны");
}

// ============ GROQ ============
async function callGroq(prompt) {
  const key = GROQ_API_KEY.value();
  if (!key) throw new Error("GROQ_API_KEY не задан");
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("Groq HTTP " + r.status + ": " + t.slice(0, 200));
  }
  const j = await r.json();
  const text = j && j.choices && j.choices[0] && j.choices[0].message
    ? (j.choices[0].message.content || "")
    : "";
  return { text, model };
}

// ============ CEREBRAS ============
async function callCerebras(prompt, model) {
  const key = CEREBRAS_API_KEY.value();
  if (!key) throw new Error("CEREBRAS_API_KEY не задан");
  const usedModel = model || process.env.CEREBRAS_MODEL || "gpt-oss-120b";
  const r = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key.trim()
    },
    body: JSON.stringify({
      model: usedModel,
      stream: false,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("Cerebras HTTP " + r.status + ": " + t.slice(0, 200));
  }
  const j = await r.json();
  const text = j && j.choices && j.choices[0] && j.choices[0].message
    ? (j.choices[0].message.content || "")
    : "";
  return { text, model: usedModel };
}

// ============ OPENROUTER ============
async function callOpenRouter(prompt, model) {
  const key = OPENROUTER_API_KEY.value();
  if (!key) throw new Error("OPENROUTER_API_KEY не задан");
  const usedModel = model || process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free";
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key.trim(),
      "HTTP-Referer": "https://oni-crm.web.app",
      "X-Title": "On.i CRM"
    },
    body: JSON.stringify({
      model: usedModel,
      stream: false,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("OpenRouter HTTP " + r.status + ": " + t.slice(0, 200));
  }
  const j = await r.json();
  const msg = (j && j.choices && j.choices[0] && j.choices[0].message) || {};
  const text = msg.content || "";
  const reasoning = msg.reasoning_content || msg.reasoning || "";
  return { text, model: usedModel, reasoning };
}

// ============ DEEPSEEK ============
async function callDeepSeek(prompt) {
  const key = DEEPSEEK_API_KEY.value();
  if (!key) throw new Error("DEEPSEEK_API_KEY не задан");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("DeepSeek HTTP " + r.status + ": " + t.slice(0, 200));
  }
  const j = await r.json();
  const text = j && j.choices && j.choices[0] && j.choices[0].message
    ? (j.choices[0].message.content || "")
    : "";
  return { text, model };
}

// ============ MAIN ============
exports.aiProxy = onCall(
  {
    secrets: [GEMINI_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY],
    memory: "512MiB",
    timeoutSeconds: 120,
    region: "us-central1"
  },
  async (req) => {
    if (!req.auth || !req.auth.uid) {
      throw new HttpsError("unauthenticated", "Требуется вход");
    }
    const uid = req.auth.uid;
    const prompt = (req.data && req.data.prompt) || "";
    const imageBase64 = (req.data && req.data.imageBase64) || null;
    const imageMime = (req.data && req.data.imageMime) || null;
    const hasImage = !!(imageBase64 && imageMime);

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

    let usedProvider = null;
    let usedModel = null;
    let text = null;
    const errors = [];
    const mode = (req.data && req.data.mode) || "auto";
    const isReasoning = mode === "reasoning";
    let reasoning = null;

    // === REASONING РЕЖИМ ===
    if (isReasoning && !hasImage) {
      try {
        const g = await callOpenRouter(prompt, "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free");
        if (g.text && g.text.trim()) {
          text = g.text;
          usedProvider = "openrouter";
          usedModel = g.model;
          reasoning = g.reasoning || null;
        }
      } catch (e) { errors.push("openrouter-reasoning: " + (e.message || e)); }

      if (!text) {
        try {
          const g = await callCerebras(prompt, "qwen-3.8-27b");
          if (g.text && g.text.trim()) {
            text = g.text;
            usedProvider = "cerebras";
            usedModel = g.model;
          }
        } catch (e) { errors.push("cerebras-reasoning: " + (e.message || e)); }
      }

      if (!text) {
        throw new HttpsError("unavailable", "Reasoning-провайдеры недоступны: " + errors.join("; ").slice(0, 500));
      }

      return {
        ok: true,
        text,
        provider: usedProvider,
        model: usedModel,
        remaining: userRemaining,
        reasoning
      };
    }

    // Цепочка: Groq → Gemini → DeepSeek
    // Если картинка — пропускаем Groq (не принимает изображения) и DeepSeek

    // 1. Groq (только текст)
    if (!hasImage) {
      try {
        const g = await callGroq(prompt);
        if (g.text && g.text.trim()) {
          text = g.text;
          usedProvider = "groq";
          usedModel = g.model;
        }
      } catch (e) {
        errors.push("groq: " + (e.message || e));
      }
    }

    // 1.5. Cerebras (только текст)
    if (!text && !hasImage) {
      try {
        const g = await callCerebras(prompt);
        if (g.text && g.text.trim()) {
          text = g.text;
          usedProvider = "cerebras";
          usedModel = g.model;
        }
      } catch (e) {
        errors.push("cerebras: " + (e.message || e));
      }
    }

    // 1.7. OpenRouter — Nemotron 120B (только текст)
    if (!text && !hasImage) {
      try {
        const g = await callOpenRouter(prompt);
        if (g.text && g.text.trim()) {
          text = g.text;
          usedProvider = "openrouter";
          usedModel = g.model;
        }
      } catch (e) {
        errors.push("openrouter: " + (e.message || e));
      }
    }

    // 2. Gemini
    if (!text) {
      try {
        const g = await callGemini(prompt, imageBase64, imageMime);
        if (g.text && g.text.trim()) {
          text = g.text;
          usedProvider = "gemini";
          usedModel = g.model;
        }
      } catch (e) {
        errors.push("gemini: " + (e.message || e));
      }
    }

    // 3. DeepSeek (только текст)
    if (!text && !hasImage) {
      try {
        const g = await callDeepSeek(prompt);
        if (g.text && g.text.trim()) {
          text = g.text;
          usedProvider = "deepseek";
          usedModel = g.model;
        }
      } catch (e) {
        errors.push("deepseek: " + (e.message || e));
      }
    }

    if (!text) {
      throw new HttpsError("unavailable", "Все AI провайдеры недоступны: " + errors.join("; ").slice(0, 500));
    }

    return {
      ok: true,
      text,
      provider: usedProvider,
      model: usedModel,
      remaining: userRemaining
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

    return {
      user: { used: userUsed, limit: USER_DAILY_LIMIT, remaining: USER_DAILY_LIMIT - userUsed }
    };
  }
);