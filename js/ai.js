// Kết nối AI. Đổi nhà cung cấp bằng CONFIG.ai.provider.
const AI = (() => {
  "use strict";

  const keyName = (p) => CONFIG.keyStoragePrefix + p;
  const safeGet = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const safeSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };

  // ---------- Đếm lượt gọi API trong ngày ----------
  const USAGE_KEY = CONFIG.storageKey + ".usage";
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
  function usage() {
    try {
      const u = JSON.parse(safeGet(USAGE_KEY) || "{}");
      return u.date === today() ? u.count : 0;
    } catch { return 0; }
  }
  const listeners = [];
  function bump() {
    const n = usage() + 1;
    safeSet(USAGE_KEY, JSON.stringify({ date: today(), count: n }));
    listeners.forEach((f) => f(n));
  }

  class AIError extends Error {
    constructor(msg, code) { super(msg); this.code = code; }
  }

  // ---------- Nhà cung cấp: Gemini ----------
  const gemini = {
    label: "Google Gemini",
    keyUrl: CONFIG.ai.gemini.keyUrl,
    modelKey: CONFIG.storageKey + ".geminiModel",

    async request(path, key, body) {
      let res;
      try {
        res = await fetch(CONFIG.ai.gemini.endpoint + path, {
          method: body ? "POST" : "GET",
          headers: Object.assign({ "x-goog-api-key": key }, body ? { "Content-Type": "application/json" } : {}),
          body: body ? JSON.stringify(body) : undefined
        });
      } catch {
        throw new AIError("Không kết nối được Gemini. Kiểm tra mạng internet.", "network");
      }
      let data = null;
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        const msg = (data && data.error && data.error.message) || "";
        if (res.status === 400 && /api key/i.test(msg)) throw new AIError("API key không đúng. Vào Cài đặt dán lại key.", "badkey");
        if (res.status === 403) throw new AIError("Key không có quyền dùng Gemini. Tạo key mới ở AI Studio.", "badkey");
        if (res.status === 429) throw new AIError("Đã chạm giới hạn miễn phí của Gemini. Chờ 1 phút rồi thử lại (nếu hết lượt ngày, mai dùng tiếp).", "quota");
        if (res.status === 404) throw new AIError("Model không còn: " + msg, "model");
        if (res.status >= 500) throw new AIError("Gemini đang bận. Thử lại sau vài giây.", "busy");
        throw new AIError("Lỗi Gemini (" + res.status + "): " + msg, "other");
      }
      return data;
    },

    // Chọn model Flash-Lite phù hợp từ danh sách model của key
    // Model bị Google ngừng cho tài khoản này → ghi nhớ để bỏ qua
    blockedKey: CONFIG.storageKey + ".geminiBlocked",
    blocked() { try { return JSON.parse(safeGet(this.blockedKey) || "[]"); } catch { return []; } },
    block(m) { const b = this.blocked(); if (!b.includes(m)) b.push(m); safeSet(this.blockedKey, JSON.stringify(b)); },

    async pickModel(key) {
      const pref = CONFIG.ai.gemini.model;
      const blocked = this.blocked();
      if (!CONFIG.ai.gemini.autoPickModel) return pref;
      const data = await this.request("/models?pageSize=200", key);
      const names = (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((n) => /flash-lite/.test(n) && !/tts|image|audio|live|embed/.test(n) && !blocked.includes(n));
      if (names.includes(pref)) return pref;
      const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
      // Ưu tiên bản ổn định, mới nhất
      names.sort((a, b) => (/preview|exp/.test(a) - /preview|exp/.test(b)) || ver(b) - ver(a) || a.length - b.length);
      if (names[0]) return names[0];
      if (!blocked.includes(pref)) return pref;
      throw new AIError("Không tìm được model Gemini Flash-Lite nào dùng được với key này.", "model");
    },

    async check(key) {
      const model = await this.pickModel(key);
      safeSet(this.modelKey, model);
      return model;
    },

    model() { return safeGet(this.modelKey) || CONFIG.ai.gemini.model; },

    toSchema(s) {
      if (s.type === "object") {
        const props = {};
        Object.entries(s.properties).forEach(([k, v]) => { props[k] = this.toSchema(v); });
        return { type: "OBJECT", properties: props, required: Object.keys(s.properties), propertyOrdering: Object.keys(s.properties) };
      }
      if (s.type === "array") return { type: "ARRAY", items: this.toSchema(s.items) };
      return { type: "STRING" };
    },

    async generateJSON(key, { system, history, schema }) {
      // Gộp các lượt cùng vai, bắt đầu bằng lượt người dùng
      const contents = [];
      history.forEach((m) => {
        const role = m.role === "ai" ? "model" : "user";
        const parts = [];
        if (m.audio) parts.push({ inlineData: { mimeType: "audio/wav", data: m.audio } });
        parts.push({ text: m.text });
        const last = contents[contents.length - 1];
        if (last && last.role === role) last.parts.push(...parts);
        else contents.push({ role, parts });
      });
      if (!contents.length || contents[0].role !== "user") contents.unshift({ role: "user", parts: [{ text: "(start)" }] });

      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          temperature: CONFIG.ai.temperature,
          responseMimeType: "application/json",
          responseSchema: this.toSchema(schema)
        }
      };
      const call = async () => {
        bump();
        return this.request("/models/" + encodeURIComponent(this.model()) + ":generateContent", key, body);
      };
      let data;
      for (let tries = 0; ; tries++) {
        try { data = await call(); break; }
        catch (e) {
          if (e.code !== "model" || tries >= 3) throw e;
          this.block(this.model());       // model bị ngừng → bỏ qua, chọn model khác rồi thử lại
          await this.check(key);
        }
      }
      const cand = data.candidates && data.candidates[0];
      const text = cand && cand.content && (cand.content.parts || []).map((p) => p.text || "").join("");
      if (!text) throw new AIError("Gemini không trả lời (" + ((cand && cand.finishReason) || "trống") + "). Thử nói cách khác.", "empty");
      try { return JSON.parse(text); }
      catch { throw new AIError("Gemini trả về sai định dạng. Thử lại nhé.", "format"); }
    }
  };

  const PROVIDERS = { gemini };
  const provider = () => PROVIDERS[CONFIG.ai.provider];
  const getKey = () => safeGet(keyName(CONFIG.ai.provider));
  const hasKey = () => !!getKey();

  async function saveKey(key) {
    key = (key || "").trim();
    if (!key) { safeSet(keyName(CONFIG.ai.provider), ""); return null; }
    const model = await provider().check(key);   // ném lỗi nếu key sai
    safeSet(keyName(CONFIG.ai.provider), key);
    return model;
  }

  function need() {
    const k = getKey();
    if (!k) throw new AIError("Chưa có API key. Vào ⚙️ Cài đặt để dán key.", "nokey");
    return k;
  }

  // ---------- Lời nhắc cho nhân vật ----------
  const SUGG = { type: "array", items: { type: "object", properties: { en: { type: "string" }, vi: { type: "string" } } } };

  function systemFor(ch, userName) {
    return [
      `You are ${ch.persona}`,
      `You are having a friendly VOICE chat in English with ${userName}, a Vietnamese learner of English, level ${CONFIG.learner.level}. ${userName} is ${CONFIG.learner.about}`,
      "Speaking rules:",
      "- Speak slowly and simply: 1 to 3 short sentences, at most about 30 words in total. Use common everyday words. No difficult idioms (if you use one, explain it simply).",
      "- Be warm and curious. Often share a short fact or habit from your country, then ask ONE simple question, often about Vietnam or the user's life, so you can compare cultures.",
      "- If the user asks \"How do you say ...?\", or mixes in Vietnamese words, help naturally: give the natural English phrase in your reply and encourage them to try saying it.",
      "- Do not correct mistakes directly. If the user makes a mistake, naturally repeat the correct form in your reply.",
      "- If the user's message is unclear (speech recognition errors), guess kindly or ask them to say it again simply.",
      `- The user's real name is ${userName}. Speech recognition often mishears Vietnamese names (for example as "Juan" or "mine"), so always call them ${userName}.`,
      "- Stay in character. Plain text only, no emojis, no markdown.",
      "Output JSON:",
      "- reply: what you say (English).",
      "- reply_vi: natural Vietnamese translation of reply.",
      `- suggestions: exactly 3 things ${userName} could say next to answer you, written in first person as ${userName}, ordered from easiest (very short) to harder (one longer sentence). Make them true-to-life for ${userName}. Each with en and vi.`
    ].join("\n");
  }

  const HEAR_RULE = (userName) =>
    `- heard: the user's last message is a voice recording. Write EXACTLY what they said in English (verbatim, keep their grammar mistakes, do not improve it). ` +
    `Spell names and Vietnamese places correctly (their name is ${userName}; e.g. Nha Trang, Da Lat, pho, banh mi). If they mixed in Vietnamese words, write those words in Vietnamese with accents. ` +
    `Then reply to what they said.`;

  // audio: chuỗi base64 WAV của lượt nói cuối (nếu dùng chế độ để AI nghe)
  async function chatTurn(ch, messages, userName, audio) {
    const key = need();
    const history = messages.slice(-CONFIG.ai.historyTurns).map((m) => ({ role: m.role, text: m.en }));
    const props = { reply: { type: "string" }, reply_vi: { type: "string" }, suggestions: SUGG };
    let system = systemFor(ch, userName);
    if (audio) {
      history.push({ role: "me", text: "(voice message)", audio });
      system += "\n" + HEAR_RULE(userName);
    }
    const out = await provider().generateJSON(key, {
      system,
      history,
      schema: { type: "object", properties: audio ? { heard: { type: "string" }, ...props } : props }
    });
    return {
      heard: audio ? String(out.heard || "").trim() : null,
      en: String(out.reply || "").trim(),
      vi: String(out.reply_vi || "").trim(),
      suggestions: (out.suggestions || []).slice(0, 3)
    };
  }

  // viText: câu tiếng Việt (điện thoại nhận) — hoặc audio: bản ghi giọng tiếng Việt cho AI tự nghe
  async function vietHelp(ch, messages, viText, userName, audio) {
    const key = need();
    const lastAi = [...messages].reverse().find((m) => m.role === "ai");
    const system = [
      `You help ${userName}, a Vietnamese learner of English (level ${CONFIG.learner.level}), say something in English during a chat with ${ch.name} from ${ch.country}.`,
      audio ? "The learner recorded what they want to say, in Vietnamese." : "The learner said it in Vietnamese (from speech recognition, may have small errors).",
      "Return JSON:",
      "- heard: the Vietnamese sentence the learner said, with correct Vietnamese accents.",
      "- standard: a natural English sentence a native speaker would say in this situation.",
      "- simple: an easier, shorter English version a beginner can say confidently.",
      "- note_vi: one short tip in Vietnamese (max 25 words) about a key word or pattern."
    ].join("\n");
    const prompt = (lastAi ? `${ch.name} just said: "${lastAi.en}"\n` : "") +
      (audio ? "The learner's Vietnamese is in the recording." : `The learner wants to say (Vietnamese): "${viText}"`);
    const out = await provider().generateJSON(key, {
      system,
      history: [{ role: "user", text: prompt, audio }],
      schema: { type: "object", properties: { heard: { type: "string" }, standard: { type: "string" }, simple: { type: "string" }, note_vi: { type: "string" } } }
    });
    return {
      heard: String(out.heard || viText || "").trim(),
      standard: String(out.standard || "").trim(), simple: String(out.simple || "").trim(), note: String(out.note_vi || "").trim()
    };
  }

  return {
    chatTurn, vietHelp, hasKey, getKey, saveKey, usage, AIError,
    onUsage: (f) => listeners.push(f),
    providerLabel: () => provider().label,
    keyUrl: () => provider().keyUrl,
    model: () => provider().model()
  };
})();
