// English Buddy — giao diện.
(() => {
  "use strict";

  // ---------- Lưu trữ trên máy ----------
  const load = () => { try { return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || {}; } catch { return {}; } };
  const state = Object.assign(
    { name: CONFIG.defaultName, best: {}, attempts: 0, rateChat: CONFIG.speech.rateChat, chats: {}, tab: "chat", hearMode: CONFIG.speech.hearModeDefault },
    load()
  );
  const persist = () => {
    try {
      const { name, best, attempts, rateChat, chats, tab, hearMode } = state;
      localStorage.setItem(CONFIG.storageKey, JSON.stringify({ name, best, attempts, rateChat, chats, tab, hearMode }));
    } catch {}
  };

  let lesson = null, cast = null;

  // ---------- Tiện ích ----------
  const $ = (s, root = document) => root.querySelector(s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const btn = (cls, text, onClick) => { const b = el("button", cls, text); if (onClick) b.addEventListener("click", onClick); return b; };
  const userName = () => state.name || CONFIG.defaultName;
  const fill = (s) => String(s || "").replaceAll("{name}", userName());
  const level = (pct) => (pct >= CONFIG.scoring.good ? "good" : pct >= CONFIG.scoring.ok ? "ok" : "bad");
  const app = () => $("#app");

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- Nút mic dùng chung ----------
  function micButton(label, cls = "btn-mic") {
    const b = el("button", cls);
    b.append(el("span", "mic-icon", "🎤"), el("span", "label", label));
    b.dataset.label = label;
    return b;
  }
  function setMic(b, on, label) {
    b.classList.toggle("listening", on);
    $(".label", b).textContent = on ? (label || "Đang nghe… bấm để dừng") : b.dataset.label;
  }
  // Bấm lần 1: nghe. Bấm khi đang nghe: dừng và lấy kết quả.
  async function listenWith(b, opts) {
    if (Speech.isListening()) { Speech.finish(); return null; }
    setMic(b, true, opts.long ? "Đang nghe… nói xong thì bấm vào đây ✓" : null);
    const r = await Speech.listen(opts);
    setMic(b, false);
    return r;
  }

  // ---------- Khối luyện một câu: nghe mẫu, nói, chấm ----------
  // opts: { wild, voiceLang, onScore(pct), onSend(text), sendLabel, big }
  function practiceWidget(text, opts = {}) {
    const box = el("div", "pw");
    const sentence = el("div", opts.big ? "big-en" : "pw-en");
    const paint = (words) => {
      sentence.innerHTML = "";
      (words || text.split(/\s+/).map((t) => ({ text: t }))).forEach((w) => sentence.append(el("span", "w " + (w.status || ""), w.text), " "));
    };
    paint();
    box.append(sentence);
    if (opts.vi) box.append(el("div", opts.big ? "big-vi" : "pw-vi", opts.vi));

    const row = el("div", "row");
    const voice = { lang: opts.voiceLang || CONFIG.speech.voiceLang };
    row.append(
      btn("btn btn-listen", "🔊 Nghe", () => Speech.speak(text, { ...voice, rate: CONFIG.speech.rateNormal })),
      btn("btn btn-listen", "🐢 Chậm", () => Speech.speak(text, { ...voice, rate: CONFIG.speech.rateSlow }))
    );
    box.append(row);

    const mic = micButton(opts.big ? "Bấm để nói" : "Nói thử câu này", opts.big ? "btn-mic" : "btn-mic small");
    const res = el("div", "result");
    if (opts.hint) res.append(el("div", "hint", opts.hint));
    mic.addEventListener("click", async () => {
      res.innerHTML = "";
      res.append(el("div", "hint", "Mời bạn nói…"));
      const r = await listenWith(mic, {
        lang: CONFIG.speech.listenLang,
        onInterim: (t) => { res.innerHTML = ""; res.append(el("div", "hint", "Đang nghe: " + t)); }
      });
      if (!r) return;
      res.innerHTML = "";
      if (r.cancelled) return;
      if (r.error) { res.append(el("div", "err", r.error)); return; }
      const s = Speech.bestScore(text, r.alts, opts.wild || []);
      paint(s.words);
      const lv = level(s.pct);
      res.append(
        el("div", "score " + lv, s.pct + "%"),
        el("div", "msg", lv === "good" ? "Tuyệt vời! 🎉" : lv === "ok" ? "Khá tốt! Thử lại các từ màu đỏ nhé." : "Nghe mẫu lại rồi thử lần nữa nhé."),
        el("div", "heard", "App nghe được: “" + s.heard + "”")
      );
      const legend = el("div", "legend");
      legend.innerHTML = '<span class="w ok">xanh</span> đúng · <span class="w near">vàng</span> gần đúng · <span class="w miss">đỏ</span> sai/thiếu';
      res.append(legend);
      opts.onScore && opts.onScore(s.pct);
    });
    box.append(mic, res);
    if (opts.onSend) box.append(btn("btn btn-send", opts.sendLabel || "Gửi câu này ➤", () => opts.onSend(text)));
    return box;
  }

  // ---------- Thanh tab ----------
  function header(active) {
    const h = el("header", "top");
    const title = el("div", "brand");
    title.append(el("h1", null, "English Buddy"), el("span", "ver", "v" + CONFIG.version));
    const tabs = el("nav", "tabs");
    [["chat", "💬 Trò chuyện"], ["phrases", "📚 Câu mẫu"], ["settings", "⚙️ Cài đặt"]].forEach(([id, label]) => {
      tabs.append(btn("tab" + (id === active ? " active" : ""), label, () => { state.tab = id; persist(); render(); }));
    });
    h.append(title, tabs);
    return h;
  }

  function render() {
    Speech.stop();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    ({ chat: viewChatList, phrases: viewPhrases, settings: viewSettings }[state.tab] || viewChatList)();
    window.scrollTo(0, 0);
  }

  // ---------- Tab: Trò chuyện ----------
  function viewChatList() {
    const a = app();
    a.innerHTML = "";
    a.append(header("chat"));
    if (!AI.hasKey()) {
      const w = el("div", "warn");
      w.append(el("div", null, "🔑 Cần Gemini API key (miễn phí) để trò chuyện với nhân vật."));
      w.append(btn("btn btn-small", "Mở Cài đặt để dán key", () => { state.tab = "settings"; persist(); render(); }));
      a.append(w);
    }
    a.append(el("p", "sub", "Chọn người để nói chuyện. Họ nói chậm, đơn giản và hỏi về Việt Nam."));
    cast.characters.forEach((ch) => {
      const card = btn("card char", null, () => openChat(ch));
      const has = (state.chats[ch.id] || []).length > 1;
      card.append(el("span", "flag", ch.flag));
      const info = el("div");
      info.append(el("div", "en", ch.name + " · " + ch.country), el("div", "vi", ch.tagline));
      card.append(info);
      if (has) card.append(el("span", "badge cont", "Tiếp tục"));
      a.append(card);
    });
    a.append(el("footer", "foot", "Đã dùng " + AI.usage() + " lượt AI hôm nay"));
  }

  // ---------- Màn trò chuyện ----------
  let chat = null; // { ch, msgs, busy }

  function openChat(ch) {
    Speech.stop();
    const msgs = (state.chats[ch.id] || []).filter((m) => m.en !== "🎤 …");
    if (!msgs.length) {
      msgs.push({ role: "ai", en: ch.opening.en, vi: ch.opening.vi, suggestions: ch.opening.suggestions });
      state.chats[ch.id] = msgs;
      persist();
    }
    chat = { ch, msgs, busy: false };
    viewChat();
    const last = msgs[msgs.length - 1];
    if (msgs.length === 1) say(fill(last.en));
  }

  const say = (text) => Speech.speak(text, { lang: chat.ch.voiceLang, rate: state.rateChat });
  const saveChat = () => { state.chats[chat.ch.id] = chat.msgs.slice(-60); persist(); };

  function viewChat() {
    const { ch } = chat;
    const a = app();
    a.innerHTML = "";
    a.classList.add("chat-mode");

    const bar = el("div", "bar chatbar");
    bar.append(
      btn("btn-back", "←", () => { a.classList.remove("chat-mode"); chat = null; render(); }),
      el("span", "who", ch.flag + " " + ch.name),
      el("span", "usage", "AI hôm nay: " + AI.usage()),
      btn("btn-icon", "↺", () => {
        if (!confirm("Bắt đầu cuộc trò chuyện mới với " + ch.name + "?")) return;
        state.chats[ch.id] = [];
        persist();
        openChat(ch);
      })
    );
    a.append(bar);

    const list = el("div", "msgs");
    list.id = "msgs";
    a.append(list);

    const dock = el("div", "dock");
    const panel = el("div", "panel");
    panel.id = "panel";
    const tools = el("div", "row");
    tools.append(
      btn("btn btn-tool", "💡 Gợi ý", showSuggestions),
      btn("btn btn-tool", "🇻🇳 Nói tiếng Việt", (e) => vietMode(e.currentTarget))
    );
    const mic = micButton("Bấm để nói tiếng Anh");
    mic.addEventListener("click", () => speakTurn(mic));

    const typeRow = el("form", "typerow");
    const inp = el("input");
    inp.placeholder = "…hoặc gõ tiếng Anh";
    inp.enterKeyHint = "send";
    typeRow.append(inp, el("button", "btn btn-small", "➤"));
    typeRow.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = inp.value.trim();
      if (!t) return;
      inp.value = "";
      inp.blur();
      sendUser(t);
    });

    dock.append(panel, tools, mic, typeRow);
    a.append(dock);
    renderMsgs();
  }

  function renderMsgs() {
    const list = $("#msgs");
    if (!list) return;
    list.innerHTML = "";
    chat.msgs.forEach((m) => {
      const b = el("div", "bubble " + m.role);
      b.append(el("div", "txt", fill(m.en)));
      if (m.role === "ai") {
        const acts = el("div", "acts");
        const vi = el("div", "vi hidden", fill(m.vi || ""));
        acts.append(
          btn("chip", "🔊 Nghe lại", () => say(fill(m.en))),
          btn("chip", "🐢 Chậm", () => Speech.speak(fill(m.en), { lang: chat.ch.voiceLang, rate: CONFIG.speech.rateSlow })),
          btn("chip", "Dịch", () => vi.classList.toggle("hidden"))
        );
        b.append(acts, vi);
      }
      list.append(b);
    });
    if (chat.busy) list.append(el("div", "bubble ai typing", chat.ch.name + " đang trả lời…"));
    const u = $(".usage");
    if (u) u.textContent = "AI hôm nay: " + AI.usage();
    requestAnimationFrame(() => list.lastElementChild && list.lastElementChild.scrollIntoView({ block: "end", behavior: "smooth" }));
  }

  function panelSet(...nodes) {
    const p = $("#panel");
    if (!p) return null;
    p.innerHTML = "";
    if (nodes.length) {
      const close = btn("panel-close", "✕", () => panelSet());
      p.append(close, ...nodes);
    }
    p.classList.toggle("open", nodes.length > 0);
    return p;
  }

  const cancelBtn = () => btn("btn btn-small", "✕ Huỷ, nói lại", () => { Speech.stop(); panelSet(); });
  const fmtSec = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

  // Ghi âm cho chế độ "AI nghe": bấm lần 1 bắt đầu, bấm lần 2 xong → trả base64 WAV (hoặc null nếu huỷ)
  async function recordWith(b, hintText) {
    if (Speech.isRecording()) { Speech.stopRecording(); return undefined; }
    let ctrl;
    const bar = el("div", "levelbar"); const lv = el("div"); bar.append(lv);
    const info = el("div", "hint", hintText);
    try {
      ctrl = await Speech.record({
        onLevel: (p, sec) => {
          lv.style.width = Math.min(100, p * 250) + "%";
          setMic(b, true, "⏺ " + fmtSec(sec) + " · nói xong thì bấm vào đây ✓");
        }
      });
    } catch (e) { panelSet(el("div", "err", e.message)); return null; }
    setMic(b, true, "⏺ 0:00 · nói xong thì bấm vào đây ✓");
    panelSet(info, bar, cancelBtn());
    const res = await ctrl.done;
    setMic(b, false);
    if (!res) { panelSet(); return null; }
    if (res.seconds < 0.6) { panelSet(el("div", "err", "Ghi âm ngắn quá, bấm lại rồi nói nhé.")); return null; }
    panelSet();
    return res.wav;
  }

  async function speakTurn(mic) {
    if (chat.busy) return;
    if (state.hearMode === "ai" && AI.hasKey()) {
      const wav = await recordWith(mic, "Cứ nói thoải mái, dừng suy nghĩ cũng được. App sẽ gửi giọng cho " + chat.ch.name + " nghe.");
      if (wav) sendUser(null, wav);
      return;
    }
    if (!Speech.isListening()) panelSet(el("div", "hint", "Mời bạn nói… dừng suy nghĩ cũng được."), cancelBtn());
    const r = await listenWith(mic, {
      lang: CONFIG.speech.listenLang,
      long: true,
      onInterim: (t) => panelSet(el("div", "hint", "Đang nghe: " + t), cancelBtn())
    });
    if (!r) return;
    if (r.cancelled) return panelSet();
    if (r.error) return panelSet(el("div", "err", r.error));
    panelSet();
    sendUser(r.alts[0]);
  }

  // text: câu đã nhận; audio: bản ghi (AI sẽ tự nghe và điền chữ)
  async function sendUser(text, audio) {
    if (chat.busy) return;
    const msg = { role: "me", en: text || "🎤 …" };
    chat.msgs.push(msg);
    if (audio) chat.pending = { msg, audio };
    saveChat();
    await askAI();
  }

  async function askAI() {
    if (!AI.hasKey()) {
      renderMsgs();
      return panelSet(el("div", "err", "Chưa có API key."), btn("btn btn-small", "Mở Cài đặt", () => { app().classList.remove("chat-mode"); state.tab = "settings"; render(); }));
    }
    chat.busy = true;
    renderMsgs();
    const c = chat;
    const pend = c.pending;
    try {
      const msgs = pend ? c.msgs.filter((m) => m !== pend.msg) : c.msgs;
      const r = await AI.chatTurn(c.ch, msgs, userName(), pend && pend.audio);
      if (pend) { pend.msg.en = r.heard || "(không nghe rõ)"; c.pending = null; }
      c.msgs.push({ role: "ai", en: r.en, vi: r.vi, suggestions: r.suggestions });
      c.busy = false;
      if (chat !== c) { state.chats[c.ch.id] = c.msgs; persist(); return; }
      saveChat();
      renderMsgs();
      say(r.en);
    } catch (e) {
      c.busy = false;
      if (chat !== c) return;
      renderMsgs();
      panelSet(el("div", "err", e.message), btn("btn btn-small", "Thử lại", () => { panelSet(); askAI(); }));
    }
  }

  function showSuggestions() {
    const last = [...chat.msgs].reverse().find((m) => m.role === "ai");
    const list = (last && last.suggestions) || [];
    if (!list.length) return panelSet(el("div", "hint", "Chưa có gợi ý cho câu này."));
    const wrap = el("div", "sugg");
    wrap.append(el("div", "panel-title", "💡 Bạn có thể nói (dễ → khó):"));
    const levels = ["Dễ", "Vừa", "Khó"];
    list.forEach((s, i) => {
      const item = el("div", "sugg-item");
      const head = btn("sugg-head", null, () => {
        const open = item.classList.toggle("open");
        if (open && !$(".pw", item)) {
          item.append(practiceWidget(fill(s.en), {
            wild: [userName()], voiceLang: CONFIG.speech.voiceLang,
            onSend: (t) => { panelSet(); sendUser(t); }
          }));
        }
      });
      head.append(el("span", "lvl l" + i, levels[i] || ""), el("span", "en", fill(s.en)), el("span", "vi", fill(s.vi)));
      item.append(head);
      wrap.append(item);
    });
    panelSet(wrap);
  }

  async function vietMode(b) {
    if (chat.busy) return;
    if (Speech.isRecording()) { Speech.stopRecording(); return; }
    if (Speech.isListening()) { Speech.finish(); return; }
    if (!AI.hasKey()) return panelSet(el("div", "err", "Chưa có API key. Vào ⚙️ Cài đặt để dán key."));
    b.classList.add("listening");
    const old = b.textContent;
    b.textContent = "🇻🇳 Nói xong bấm đây ✓";
    let viText = null, audio = null;
    if (state.hearMode === "ai") {
      const rec = await Speech.record({}).catch((e) => { panelSet(el("div", "err", e.message)); return null; });
      if (rec) {
        panelSet(el("div", "hint", "Nói câu bạn muốn nói bằng tiếng Việt… nói xong bấm lại nút 🇻🇳."), cancelBtn());
        const res = await rec.done;
        if (res && res.seconds >= 0.6) audio = res.wav;
      }
      b.classList.remove("listening");
      b.textContent = old;
      if (!audio) return panelSet();
    } else {
      panelSet(el("div", "hint", "Nói câu bạn muốn nói bằng tiếng Việt… nói xong bấm lại nút 🇻🇳."), cancelBtn());
      const r = await Speech.listen({
        lang: CONFIG.speech.vietLang,
        long: true,
        onInterim: (t) => panelSet(el("div", "hint", "Bạn nói: " + t), cancelBtn())
      });
      b.classList.remove("listening");
      b.textContent = old;
      if (r.cancelled) return panelSet();
      if (r.error) return panelSet(el("div", "err", r.error));
      viText = r.alts[0];
    }
    panelSet(el("div", "hint", viText ? "Bạn muốn nói: “" + viText + "”" : "Đã ghi âm."), el("div", "hint", "Đang tìm cách nói tiếng Anh…"));
    try {
      const h = await AI.vietHelp(chat.ch, chat.msgs, viText, userName(), audio);
      const wrap = el("div", "help");
      wrap.append(el("div", "panel-title", "🇻🇳 “" + h.heard + "”"));
      wrap.append(el("div", "help-label", "Cách nói đơn giản"));
      wrap.append(practiceWidget(h.simple, { onSend: (t) => { panelSet(); sendUser(t); } }));
      if (h.standard && h.standard.toLowerCase() !== h.simple.toLowerCase()) {
        wrap.append(el("div", "help-label", "Cách nói tự nhiên"));
        wrap.append(practiceWidget(h.standard, { onSend: (t) => { panelSet(); sendUser(t); } }));
      }
      if (h.note) wrap.append(el("div", "note", "💬 " + h.note));
      panelSet(wrap);
      renderMsgs();
      Speech.speak(h.simple, { rate: CONFIG.speech.rateNormal });
    } catch (e) {
      panelSet(el("div", "err", e.message));
    }
  }

  // ---------- Tab: Câu mẫu ----------
  function viewPhrases() {
    const a = app();
    a.innerHTML = "";
    a.append(header("phrases"), el("p", "sub", lesson.title));
    lesson.topics.forEach((topic) => {
      const sec = el("section", "topic");
      const done = topic.phrases.filter((_, i) => (state.best[topic.id + "-" + i] || 0) >= CONFIG.scoring.good).length;
      const h = el("h2");
      h.append(el("span", "icon", topic.icon), el("span", null, topic.name), el("span", "count", done + "/" + topic.phrases.length));
      sec.append(h);
      topic.phrases.forEach((p, i) => {
        const card = btn("card", null, () => viewPractice(topic, i));
        const best = state.best[topic.id + "-" + i];
        card.append(el("div", "en", fill(p.en)), el("div", "vi", fill(p.vi)));
        if (best != null) card.append(el("span", "badge " + level(best), best + "%"));
        sec.append(card);
      });
      a.append(sec);
    });
    a.append(el("footer", "foot", "Đã luyện " + state.attempts + " lượt"));
  }

  function viewPractice(topic, index) {
    Speech.stop();
    const p = topic.phrases[index];
    const key = topic.id + "-" + index;
    const a = app();
    a.innerHTML = "";
    const bar = el("div", "bar");
    bar.append(btn("btn-back", "← Danh sách", render), el("span", "pos", topic.icon + " " + (index + 1) + "/" + topic.phrases.length));
    a.append(bar);

    const best = state.best[key];
    const card = el("div", "practice");
    card.append(practiceWidget(fill(p.en), {
      big: true, vi: fill(p.vi), wild: [userName()],
      hint: best != null ? "Điểm cao nhất của bạn: " + best + "%" : null,
      onScore: (pct) => {
        state.attempts++;
        if (!state.best[key] || pct > state.best[key]) state.best[key] = pct;
        persist();
      }
    }));
    a.append(card);

    const nav = el("div", "row nav");
    const prev = btn("btn", "‹ Câu trước", () => viewPractice(topic, index - 1));
    prev.disabled = index === 0;
    const next = btn("btn", "Câu sau ›", () => viewPractice(topic, index + 1));
    next.disabled = index >= topic.phrases.length - 1;
    nav.append(prev, next);
    a.append(nav);
    window.scrollTo(0, 0);
  }

  // ---------- Tab: Cài đặt ----------
  function viewSettings() {
    const a = app();
    a.innerHTML = "";
    a.append(header("settings"));

    // API key
    const sKey = el("section", "set");
    sKey.append(el("h2", null, "🔑 API key (" + AI.providerLabel() + ")"));
    const status = el("div", "hint left");
    const showStatus = () => {
      status.textContent = AI.hasKey() ? "✅ Đã có key trên máy này · model: " + AI.model() : "Chưa có key.";
    };
    showStatus();
    const keyRow = el("div", "keyrow");
    const inp = el("input");
    inp.type = "password";
    inp.placeholder = AI.hasKey() ? "•••••••• (đã lưu) — dán key mới để thay" : "Dán key vào đây (AIza…)";
    inp.autocomplete = "off";
    inp.spellcheck = false;
    const eye = btn("btn btn-small", "👁", () => { inp.type = inp.type === "password" ? "text" : "password"; });
    keyRow.append(inp, eye);
    const save = btn("btn btn-primary", "Lưu & kiểm tra key", async () => {
      const v = inp.value.trim();
      if (!v) return toast("Dán key trước đã");
      save.disabled = true;
      status.textContent = "Đang kiểm tra key…";
      try {
        const m = await AI.saveKey(v);
        inp.value = "";
        inp.placeholder = "•••••••• (đã lưu) — dán key mới để thay";
        showStatus();
        toast("Key dùng được! Model: " + m);
      } catch (e) {
        status.textContent = "❌ " + e.message;
      }
      save.disabled = false;
    });
    const del = btn("btn btn-small danger", "Xoá key khỏi máy", async () => {
      if (!confirm("Xoá API key khỏi điện thoại này?")) return;
      await AI.saveKey("");
      showStatus();
      toast("Đã xoá key");
    });
    const how = el("details", "how");
    how.append(el("summary", null, "Cách lấy key miễn phí"));
    const ol = el("ol");
    [
      "Mở " + AI.keyUrl() + " và đăng nhập Google.",
      "Bấm “Create API key” (chọn project mặc định nếu được hỏi).",
      "Copy chuỗi bắt đầu bằng AIza…, quay lại đây dán vào ô trên, bấm “Lưu & kiểm tra”."
    ].forEach((t) => ol.append(el("li", null, t)));
    const link = el("a", null, "Mở trang lấy key ↗");
    link.href = AI.keyUrl();
    link.target = "_blank";
    link.rel = "noopener";
    how.append(ol, link, el("div", "hint left", "Key chỉ lưu trên máy này, không gửi đi đâu ngoài Google."));
    sKey.append(status, keyRow, save, del, how, el("div", "hint left", "Đã dùng hôm nay: " + AI.usage() + " lượt AI"));
    a.append(sKey);

    // Tên
    const sName = el("section", "set");
    sName.append(el("h2", null, "🙂 Tên của bạn"));
    const n = el("input");
    n.value = state.name;
    n.maxLength = 20;
    n.addEventListener("change", () => { state.name = n.value.trim() || CONFIG.defaultName; persist(); toast("Đã lưu tên"); });
    sName.append(n, el("div", "hint left", "Dùng trong câu mẫu và để nhân vật gọi tên bạn."));
    a.append(sName);

    // Tốc độ nói
    const sRate = el("section", "set");
    sRate.append(el("h2", null, "🐢 Tốc độ nhân vật nói"));
    const r = el("input");
    r.type = "range"; r.min = "0.5"; r.max = "1.1"; r.step = "0.05"; r.value = state.rateChat;
    const rv = el("span", "hint", "×" + state.rateChat);
    r.addEventListener("input", () => { rv.textContent = "×" + r.value; });
    r.addEventListener("change", () => { state.rateChat = parseFloat(r.value); persist(); Speech.speak("Hello! How are you today?", { rate: state.rateChat }); });
    sRate.append(r, rv);
    a.append(sRate);

    // Cách nghe giọng
    const sHear = el("section", "set");
    sHear.append(el("h2", null, "👂 Ai nghe giọng bạn khi trò chuyện?"));
    [
      ["device", "📱 Điện thoại nghe", "Miễn phí, thấy chữ ngay khi nói. Hay nghe sai tên riêng, địa danh."],
      ["ai", "✨ Gemini nghe", "Nghe đúng tên và địa danh hơn nhiều. Gửi kèm lượt trả lời nên không tốn thêm lượt AI. Chữ hiện sau khi gửi."]
    ].forEach(([id, label, desc]) => {
      const opt = el("label", "opt" + (state.hearMode === id ? " on" : ""));
      const radio = el("input");
      radio.type = "radio"; radio.name = "hear"; radio.checked = state.hearMode === id;
      radio.addEventListener("change", () => {
        state.hearMode = id; persist();
        sHear.querySelectorAll(".opt").forEach((o) => o.classList.toggle("on", o === opt));
        toast("Đã chọn: " + label);
      });
      const txt = el("div");
      txt.append(el("div", "opt-title", label), el("div", "opt-desc", desc));
      opt.append(radio, txt);
      sHear.append(opt);
    });
    sHear.append(el("div", "hint left", "Phần luyện câu mẫu và chấm điểm vẫn dùng điện thoại nghe (miễn phí)."));
    a.append(sHear);

    // Mic
    const sMic = el("section", "set");
    sMic.append(el("h2", null, "🎙️ Mic"));
    const out = el("div", "hint left");
    sMic.append(btn("btn", "Kiểm tra mic", () => Speech.micTest(out)), out);
    if (Speech.lastLog.length) {
      const d = el("details", "how");
      d.append(el("summary", null, "Nhật ký nhận giọng lần gần nhất"), el("pre", "log", Speech.lastLog.join("\n")));
      sMic.append(d);
    }
    a.append(sMic);
    a.append(el("footer", "foot", "English Buddy v" + CONFIG.version + " · dữ liệu lưu trên máy này"));
  }

  // ---------- Khởi động ----------
  Promise.all([
    fetch(CONFIG.phrasesFile).then((r) => r.json()),
    fetch(CONFIG.charactersFile).then((r) => r.json())
  ])
    .then(([p, c]) => { lesson = p; cast = c; render(); })
    .catch(() => { app().innerHTML = '<div class="err">Không tải được dữ liệu. Kiểm tra mạng rồi tải lại trang.</div>'; });

  AI.onUsage((n) => { const u = $(".usage"); if (u) u.textContent = "AI hôm nay: " + n; });
})();
