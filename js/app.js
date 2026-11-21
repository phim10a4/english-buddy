// English Buddy v0.1 — kho câu mẫu, nghe mẫu, nói và chấm điểm khớp.
(() => {
  "use strict";

  // ---------- Lưu trữ trên máy ----------
  const store = {
    load() {
      try { return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || {}; }
      catch { return {}; }
    },
    save(data) {
      try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(data)); } catch {}
    }
  };
  const state = Object.assign({ name: CONFIG.defaultName, best: {}, attempts: 0 }, store.load());
  const persist = () => store.save({ name: state.name, best: state.best, attempts: state.attempts });

  let lesson = null;
  let current = { topic: null, index: 0 };

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const fill = (s) => s.replaceAll("{name}", state.name || CONFIG.defaultName);

  // ---------- Chuẩn hoá chữ để so khớp ----------
  const CONTRACTIONS = {
    "i'm": "i am", "you're": "you are", "we're": "we are", "they're": "they are",
    "he's": "he is", "she's": "she is", "it's": "it is", "that's": "that is",
    "what's": "what is", "there's": "there is", "here's": "here is", "let's": "let us",
    "i'll": "i will", "you'll": "you will", "we'll": "we will", "i've": "i have",
    "you've": "you have", "i'd": "i would", "don't": "do not", "doesn't": "does not",
    "didn't": "did not", "can't": "can not", "cannot": "can not", "won't": "will not",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "haven't": "have not"
  };
  const SMALL = ["zero","one","two","three","four","five","six","seven","eight","nine","ten",
    "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  const numToWords = (n) => {
    if (n < 20) return SMALL[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + SMALL[n % 10] : "");
    return String(n);
  };
  const SAME = { okay: "ok", gonna: "going to", wanna: "want to" };

  function normWord(w) {
    w = w.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9'\-]/g, "");
    w = w.replace(/^'+|'+$/g, "");
    if (!w) return [];
    if (CONTRACTIONS[w]) return CONTRACTIONS[w].split(" ");
    if (SAME[w]) return SAME[w].split(" ");
    if (/^\d+$/.test(w)) return numToWords(parseInt(w, 10)).split(" ");
    if (w.includes("-")) return w.split("-").filter(Boolean).flatMap(normWord);
    return [w.replace(/'s$/, "")];
  }
  const tokenize = (text) => text.split(/\s+/).flatMap(normWord);

  function lev(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    return dp[a.length][b.length];
  }
  // 1 = khớp, 0.75 = gần đúng, 0 = sai
  function wordMatch(t, s, isWild) {
    if (isWild) return 1;
    if (t === s) return 1;
    if (t.length >= 4 && lev(t, s) <= 1) return 0.75;
    return 0;
  }

  // So khớp theo dãy con chung dài nhất (cho phép gần đúng)
  function align(target, spoken) {
    const n = target.length, m = spoken.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++)
      for (let j = 1; j <= m; j++) {
        const w = wordMatch(target[i-1].w, spoken[j-1], target[i-1].wild);
        dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1], w ? dp[i-1][j-1] + w : -1);
      }
    const marks = new Array(n).fill(0);
    let i = n, j = m;
    while (i > 0 && j > 0) {
      const w = wordMatch(target[i-1].w, spoken[j-1], target[i-1].wild);
      if (w && dp[i][j] === dp[i-1][j-1] + w) { marks[i-1] = w; i--; j--; }
      else if (dp[i-1][j] >= dp[i][j-1]) i--;
      else j--;
    }
    return { marks, total: dp[n][m] };
  }

  // Câu mẫu → danh sách từ hiển thị, mỗi từ gồm các token chuẩn hoá
  function buildTarget(rawEn) {
    const display = [];
    const tokens = [];
    rawEn.split(/\s+/).forEach((word) => {
      const isName = word.includes("{name}");
      const shown = fill(word);
      const toks = isName ? normWord(shown).map((w) => ({ w, wild: true })) : normWord(shown).map((w) => ({ w, wild: false }));
      const idx = toks.map((t) => { tokens.push(t); return tokens.length - 1; });
      display.push({ text: shown, idx });
    });
    return { display, tokens };
  }

  function score(rawEn, transcript) {
    const t = buildTarget(rawEn);
    const { marks, total } = align(t.tokens, tokenize(transcript));
    const pct = t.tokens.length ? Math.round((total / t.tokens.length) * 100) : 0;
    const words = t.display.map((d) => {
      if (!d.idx.length) return { text: d.text, status: "ok" };
      const vals = d.idx.map((k) => marks[k]);
      const status = vals.every((v) => v === 1) ? "ok" : vals.every((v) => v > 0) ? "near" : "miss";
      return { text: d.text, status };
    });
    return { pct, words };
  }

  // ---------- Đọc mẫu ----------
  let voice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.replace("_", "-").startsWith("en"));
    voice =
      vs.find((v) => v.lang.replace("_", "-") === CONFIG.speech.voiceLang && /google/i.test(v.name)) ||
      vs.find((v) => v.lang.replace("_", "-") === CONFIG.speech.voiceLang) ||
      vs[0] || null;
  }
  if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }
  function speak(text, rate) {
    if (!("speechSynthesis" in window)) return toast("Máy không hỗ trợ đọc mẫu.");
    stopListening();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = CONFIG.speech.voiceLang;
    if (voice) u.voice = voice;
    u.rate = rate;
    speechSynthesis.speak(u);
  }

  // ---------- Nhận giọng nói ----------
  const getSR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  const isBrave = !!navigator.brave;
  const BRAVE_MSG = "Bạn đang dùng trình duyệt Brave — Brave không hỗ trợ nhận giọng nói. Hãy mở link này bằng Google Chrome.";

  // Nhật ký dò lỗi mic
  let dlogT0 = 0;
  function dlogReset() {
    dlogT0 = performance.now();
    const p = document.querySelector(".miclog pre");
    if (p) p.textContent = "";
  }
  function dlog(msg) {
    const p = document.querySelector(".miclog pre");
    const t = ((performance.now() - dlogT0) / 1000).toFixed(1);
    if (p) p.textContent += t + "s  " + msg + "\n";
  }

  // Kiểm tra mic thu được tiếng không (không cần nhận giọng nói)
  async function micTest(out) {
    out.textContent = "Đang mở mic… nói gì đó trong 5 giây";
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      out.textContent = "❌ Không mở được mic: " + e.name + ". Hãy cho phép Micrô cho trang này.";
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let max = 0;
    const bar = el("div", "levelbar"); const fillEl = el("div"); bar.append(fillEl);
    out.textContent = "Đang nghe… nói gì đó";
    out.append(bar);
    const t0 = performance.now();
    await new Promise((done) => {
      (function tick() {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        max = Math.max(max, peak);
        fillEl.style.width = Math.min(100, peak / 0.8) + "%";
        if (performance.now() - t0 < 5000) requestAnimationFrame(tick); else done();
      })();
    });
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    out.textContent = max > 10
      ? "✅ Mic thu được tiếng (mức " + max + "). Mic tốt."
      : "⚠️ Mic mở được nhưng gần như không có tiếng (mức " + max + "). Kiểm tra mic hoặc ứng dụng khác đang dùng mic.";
  }

  function stopListening() {
    if (rec) { try { rec.abort(); } catch {} rec = null; }
    setMicUI(false);
  }

  function setMicUI(on) {
    const b = $("#btn-mic");
    if (!b) return;
    b.classList.toggle("listening", on);
    b.querySelector(".label").textContent = on ? "Đang nghe… bấm để dừng" : "Bấm để nói";
  }

  function startListening() {
    const SR = getSR();
    if (!SR) return showResult({ error: "Trình duyệt này không hỗ trợ nhận giọng nói. Hãy dùng Chrome trên Android." });
    if (rec) { rec.stop(); return; }
    if ("speechSynthesis" in window) speechSynthesis.cancel();

    const phrase = currentPhrase();
    rec = new SR();
    rec.lang = CONFIG.speech.listenLang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = CONFIG.speech.maxAlternatives;

    let finalAlts = null;
    let lastInterim = "";
    let hadError = false;

    dlogReset();
    dlog(navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 120));
    dlog("bắt đầu · " + (SR === window.webkitSpeechRecognition ? "webkit" : "std") + " · " + rec.lang);
    rec.onstart = () => { dlog("start"); setMicUI(true); showResult({ interim: "" }); };
    rec.onaudiostart = () => dlog("audiostart (mic mở)");
    rec.onsoundstart = () => dlog("soundstart (có âm thanh)");
    rec.onspeechstart = () => dlog("speechstart (có giọng nói)");
    rec.onspeechend = () => dlog("speechend");
    rec.onaudioend = () => dlog("audioend");
    rec.onnomatch = () => dlog("nomatch");
    rec.onresult = (e) => {
      try {
        const r = e.results[e.results.length - 1];
        dlog("result #" + e.results.length + (r.isFinal ? " final" : " tạm") + ": " + (r[0] && r[0].transcript));
      } catch (x) { dlog("result (lỗi đọc: " + x.message + ")"); }
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          finalAlts = Array.from(r).map((a) => a.transcript);
        } else {
          interim += r[0].transcript;
        }
      }
      if (interim) { lastInterim = interim; showResult({ interim }); }
    };
    rec.onerror = (e) => {
      const msg = {
        "not-allowed": "Chưa cho phép dùng mic. Bấm biểu tượng bên trái thanh địa chỉ → Quyền → Micrô → Cho phép, rồi thử lại.",
        "service-not-allowed": "Chưa cho phép dùng mic. Bấm biểu tượng bên trái thanh địa chỉ → Quyền → Micrô → Cho phép.",
        "no-speech": "Không nghe thấy gì. Thử nói to và rõ hơn, gần điện thoại hơn.",
        "audio-capture": "Không tìm thấy mic. Kiểm tra mic của máy.",
        "network": "Nhận giọng nói cần có mạng internet.",
        "aborted": null
      }[e.error];
      dlog("error: " + e.error + (e.message ? " · " + e.message : ""));
      hadError = true;
      if (msg !== null) showResult({ error: (isBrave && e.error !== "not-allowed") ? BRAVE_MSG : (msg || "Lỗi nhận giọng nói: " + e.error) });
      finalAlts = null; lastInterim = "";
      rec = null; setMicUI(false);
    };
    rec.onend = () => {
      dlog("end");
      setMicUI(false);
      rec = null;
      const alts = finalAlts || (lastInterim ? [lastInterim] : null);
      if (!alts) {
        if (!hadError) showResult({ error: isBrave
          ? BRAVE_MSG
          : "Không nhận được giọng nói. Thử bấm lại, nói to rõ ngay sau khi nút chuyển đỏ. Nếu vẫn vậy, hãy mở app bằng Google Chrome." });
        return;
      }
      let best = null, bestText = "";
      alts.forEach((txt) => {
        const r = score(phrase.en, txt);
        if (!best || r.pct > best.pct) { best = r; bestText = txt; }
      });
      state.attempts++;
      const key = phraseKey();
      if (!state.best[key] || best.pct > state.best[key]) state.best[key] = best.pct;
      persist();
      showResult({ result: best, heard: bestText });
    };

    try { rec.start(); } catch (err) { rec = null; showResult({ error: "Không bật được mic: " + err.message }); }
  }

  // ---------- Giao diện ----------
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2500);
  }

  const phraseKey = () => current.topic.id + "-" + current.index;
  const currentPhrase = () => current.topic.phrases[current.index];
  const level = (pct) => (pct >= CONFIG.scoring.good ? "good" : pct >= CONFIG.scoring.ok ? "ok" : "bad");

  function renderHome() {
    stopListening();
    const app = $("#app");
    app.innerHTML = "";

    const head = el("header", "top");
    head.append(el("h1", null, "English Buddy"), el("div", "sub", lesson.title));
    app.append(head);

    if (isBrave) {
      app.append(el("div", "warn", "⚠️ " + BRAVE_MSG));
    } else if (!getSR()) {
      app.append(el("div", "warn", "⚠️ Trình duyệt này không hỗ trợ nhận giọng nói. Hãy mở bằng Chrome trên Android."));
    }

    const nameRow = el("label", "name-row");
    nameRow.append(el("span", null, "Tên bạn dùng trong câu mẫu:"));
    const inp = el("input");
    inp.value = state.name;
    inp.maxLength = 20;
    inp.addEventListener("change", () => { state.name = inp.value.trim() || CONFIG.defaultName; persist(); toast("Đã lưu tên"); });
    nameRow.append(inp);
    app.append(nameRow);

    const testBox = el("div", "mictest");
    const testBtn = el("button", "btn", "🎙️ Kiểm tra mic");
    const testOut = el("div", "mictest-out");
    testBtn.addEventListener("click", () => micTest(testOut));
    testBox.append(testBtn, testOut);
    app.append(testBox);

    lesson.topics.forEach((topic) => {
      const sec = el("section", "topic");
      const done = topic.phrases.filter((_, i) => (state.best[topic.id + "-" + i] || 0) >= CONFIG.scoring.good).length;
      const h = el("h2");
      h.append(el("span", "icon", topic.icon), el("span", null, topic.name), el("span", "count", done + "/" + topic.phrases.length));
      sec.append(h);
      topic.phrases.forEach((p, i) => {
        const card = el("button", "card");
        const best = state.best[topic.id + "-" + i];
        card.append(el("div", "en", fill(p.en)), el("div", "vi", fill(p.vi)));
        if (best != null) card.append(el("span", "badge " + level(best), best + "%"));
        card.addEventListener("click", () => openPractice(topic, i));
        sec.append(card);
      });
      app.append(sec);
    });

    app.append(el("footer", "foot", "v" + CONFIG.version + " · đã luyện " + state.attempts + " lượt"));
    window.scrollTo(0, 0);
  }

  function openPractice(topic, index) {
    current = { topic, index };
    renderPractice();
  }

  function renderPractice() {
    stopListening();
    const p = currentPhrase();
    const app = $("#app");
    app.innerHTML = "";

    const bar = el("div", "bar");
    const back = el("button", "btn-back", "← Danh sách");
    back.addEventListener("click", renderHome);
    bar.append(back, el("span", "pos", current.topic.icon + " " + (current.index + 1) + "/" + current.topic.phrases.length));
    app.append(bar);

    const box = el("div", "practice");
    const en = el("div", "big-en");
    en.id = "sentence";
    fill(p.en).split(/\s+/).forEach((w) => { en.append(el("span", "w", w), " "); });
    box.append(en, el("div", "big-vi", fill(p.vi)));

    const listen = el("div", "row");
    const b1 = el("button", "btn btn-listen", "🔊 Nghe mẫu");
    b1.addEventListener("click", () => speak(fill(p.en), CONFIG.speech.rateNormal));
    const b2 = el("button", "btn btn-listen", "🐢 Nghe chậm");
    b2.addEventListener("click", () => speak(fill(p.en), CONFIG.speech.rateSlow));
    listen.append(b1, b2);
    box.append(listen);

    const mic = el("button", "btn-mic");
    mic.id = "btn-mic";
    mic.append(el("span", "mic-icon", "🎤"), el("span", "label", "Bấm để nói"));
    mic.addEventListener("click", startListening);
    box.append(mic);

    const res = el("div", "result");
    res.id = "result";
    const best = state.best[phraseKey()];
    if (best != null) res.append(el("div", "hint", "Điểm cao nhất của bạn: " + best + "%"));
    box.append(res);
    const log = el("details", "miclog");
    log.append(el("summary", null, "Nhật ký mic (để dò lỗi)"), el("pre"));
    log.open = true;
    box.append(log);
    app.append(box);

    const nav = el("div", "row nav");
    const prev = el("button", "btn", "‹ Câu trước");
    prev.disabled = current.index === 0;
    prev.addEventListener("click", () => openPractice(current.topic, current.index - 1));
    const next = el("button", "btn", "Câu sau ›");
    next.disabled = current.index >= current.topic.phrases.length - 1;
    next.addEventListener("click", () => openPractice(current.topic, current.index + 1));
    nav.append(prev, next);
    app.append(nav);
    window.scrollTo(0, 0);
  }

  function showResult(r) {
    const box = $("#result");
    if (!box) return;
    box.innerHTML = "";
    const sentence = $("#sentence");

    if (r.error) { box.append(el("div", "err", r.error)); return; }
    if (r.interim != null) {
      box.append(el("div", "hint", r.interim ? "Đang nghe: " + r.interim : "Mời bạn nói câu trên…"));
      return;
    }
    const { result, heard } = r;
    sentence.innerHTML = "";
    result.words.forEach((w) => { sentence.append(el("span", "w " + w.status, w.text), " "); });

    const lv = level(result.pct);
    const sc = el("div", "score " + lv, result.pct + "%");
    const msg = lv === "good" ? "Tuyệt vời! 🎉" : lv === "ok" ? "Khá tốt! Thử lại các từ màu đỏ nhé." : "Nghe mẫu lại rồi thử lần nữa nhé.";
    box.append(sc, el("div", "msg", msg), el("div", "heard", "App nghe được: “" + heard + "”"));
    const legend = el("div", "legend");
    legend.innerHTML = '<span class="w ok">xanh</span> đúng · <span class="w near">vàng</span> gần đúng · <span class="w miss">đỏ</span> sai/thiếu';
    box.append(legend);
  }

  // ---------- Khởi động ----------
  fetch(CONFIG.phrasesFile)
    .then((r) => r.json())
    .then((data) => { lesson = data; renderHome(); })
    .catch(() => { $("#app").innerHTML = '<div class="err">Không tải được bài học. Kiểm tra mạng rồi tải lại trang.</div>'; });

  // để kiểm thử
  window.__eb = { score, tokenize };
})();
