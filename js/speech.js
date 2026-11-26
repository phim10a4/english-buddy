// Giọng nói: đọc mẫu (TTS), nhận giọng (STT), chấm độ khớp.
const Speech = (() => {
  "use strict";

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
  function wordMatch(t, s, wild) {
    if (wild || t === s) return 1;
    if (t.length >= 4 && lev(t, s) <= 1) return 0.75;
    return 0;
  }
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

  // text: câu mẫu đã điền tên; wildWords: các từ chấp nhận mọi cách nghe (vd tên riêng)
  function score(text, transcript, wildWords = []) {
    const wild = new Set(wildWords.flatMap(tokenize));
    const display = [], tokens = [];
    text.split(/\s+/).filter(Boolean).forEach((word) => {
      const idx = normWord(word).map((w) => { tokens.push({ w, wild: wild.has(w) }); return tokens.length - 1; });
      display.push({ text: word, idx });
    });
    const { marks, total } = align(tokens, tokenize(transcript));
    const pct = tokens.length ? Math.round((total / tokens.length) * 100) : 0;
    const words = display.map((d) => {
      if (!d.idx.length) return { text: d.text, status: "ok" };
      const v = d.idx.map((k) => marks[k]);
      return { text: d.text, status: v.every((x) => x === 1) ? "ok" : v.every((x) => x > 0) ? "near" : "miss" };
    });
    return { pct, words };
  }
  function bestScore(text, alts, wildWords) {
    let best = null, heard = "";
    alts.forEach((t) => { const r = score(text, t, wildWords); if (!best || r.pct > best.pct) { best = r; heard = t; } });
    return { ...best, heard };
  }

  // ---------- Đọc mẫu ----------
  const hasTTS = "speechSynthesis" in window;
  const norm = (l) => (l || "").replace("_", "-").toLowerCase();
  function pickVoice(lang) {
    if (!hasTTS) return null;
    const vs = speechSynthesis.getVoices();
    const want = norm(lang);
    const base = want.split("-")[0];
    return (
      vs.find((v) => norm(v.lang) === want && /google/i.test(v.name)) ||
      vs.find((v) => norm(v.lang) === want) ||
      (base === "en" && vs.find((v) => norm(v.lang) === "en-us" && /google/i.test(v.name))) ||
      vs.find((v) => norm(v.lang).startsWith(base)) ||
      null
    );
  }
  if (hasTTS) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; }

  // Thay từ tiếng Việt (không dấu hoặc có dấu) bằng cách đọc giọng Anh hiểu được
  const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  const PRON = Object.entries(CONFIG.speech.pronounce || {}).sort((a, b) => b[0].length - a[0].length);
  function forSpeech(text) {
    let out = strip(text);
    PRON.forEach(([w, say]) => {
      out = out.replace(new RegExp("\\b" + w.replace(/ /g, "\\s+") + "\\b", "gi"), say);
    });
    return out;
  }

  function speak(text, { lang = CONFIG.speech.voiceLang, rate = 1 } = {}) {
    return new Promise((resolve) => {
      if (!hasTTS) return resolve();
      stop();
      speechSynthesis.cancel();
      const v = pickVoice(lang);
      const u = new SpeechSynthesisUtterance(lang.startsWith("en") ? forSpeech(text) : text);
      u.lang = v ? v.lang : lang;
      if (v) u.voice = v;
      u.rate = rate;
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }

  // ---------- Nhận giọng nói ----------
  const getSR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let stateCb = null;
  const lastLog = [];

  const ERR = {
    "not-allowed": "Chưa cho phép dùng mic. Bấm biểu tượng bên trái thanh địa chỉ → Quyền → Micrô → Cho phép, rồi thử lại.",
    "service-not-allowed": "Máy chưa cho dùng dịch vụ nhận giọng nói. Kiểm tra quyền Micrô và ứng dụng \"Speech Services by Google\".",
    "no-speech": "Không nghe thấy gì. Thử nói to và rõ hơn, gần điện thoại hơn.",
    "audio-capture": "Không tìm thấy mic. Kiểm tra mic của máy.",
    "network": "Nhận giọng nói cần có mạng internet.",
    "language-not-supported": "Máy chưa hỗ trợ nhận giọng ngôn ngữ này. Cài/cập nhật \"Speech Services by Google\" trên CH Play."
  };

  // Trả về Promise: { alts: [...] } | { error } | { cancelled: true }
  // long = true: không tự dừng khi bạn ngừng nói; nghe tiếp cho tới khi gọi finish() (bấm Xong).
  let session = null;   // { done, cancel, recorder... } của lần nghe hiện tại

  function listen({ lang = CONFIG.speech.listenLang, onInterim, long = false } = {}) {
    return new Promise((resolve) => {
      const SR = getSR();
      if (!SR) return resolve({ error: "Trình duyệt này không hỗ trợ nhận giọng nói. Hãy dùng Chrome trên Android." });
      if (hasTTS) speechSynthesis.cancel();
      stop();

      const t0 = performance.now();
      lastLog.length = 0;
      const log = (m) => lastLog.push(((performance.now() - t0) / 1000).toFixed(1) + "s " + m);
      const maxMs = (CONFIG.speech.maxListenSec || 90) * 1000;

      const s = { userDone: false, cancelled: false, finished: false };
      session = s;
      const parts = [];          // các đoạn đã chốt (chế độ long)
      let lastAlts = null;       // các phương án của đoạn cuối
      let err = null;

      const finishAll = () => {
        if (s.finished) return;
        s.finished = true;
        if (session === s) session = null;
        rec = null;
        stateCb && stateCb(false);
        if (s.cancelled) return resolve({ cancelled: true });
        const before = parts.join(" ").trim();
        if (lastAlts && lastAlts.length) {
          return resolve({ alts: lastAlts.map((a) => (before ? before + " " + a : a).trim()) });
        }
        if (before) return resolve({ alts: [before] });
        resolve({ error: err || "Không nhận được giọng nói. Bấm lại rồi nói ngay khi nút chuyển đỏ." });
      };

      const startOne = () => {
        const r = new SR();
        rec = r;
        r.lang = lang;
        r.interimResults = true;
        r.continuous = false;
        r.maxAlternatives = CONFIG.speech.maxAlternatives;
        let finalAlts = null, interim = "";

        r.onstart = () => { log("start " + lang); stateCb && stateCb(true); };
        r.onaudiostart = () => log("audiostart");
        r.onspeechstart = () => log("speechstart");
        r.onresult = (e) => {
          let tmp = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const x = e.results[i];
            if (x.isFinal) finalAlts = Array.from(x).map((a) => a.transcript.trim()).filter(Boolean);
            else tmp += x[0].transcript;
          }
          if (tmp) interim = tmp.trim();
          const now = finalAlts ? finalAlts[0] : interim;
          onInterim && onInterim([...parts, now].join(" ").trim());
          log("result " + (finalAlts ? "final" : "tạm"));
        };
        r.onerror = (e) => {
          log("error " + e.error);
          if (e.error === "aborted" || e.error === "no-speech") return;   // im lặng: bỏ qua
          err = ERR[e.error] || "Lỗi nhận giọng nói: " + e.error;
        };
        r.onend = () => {
          log("end");
          const got = finalAlts && finalAlts.length ? finalAlts : interim ? [interim] : null;
          const fatal = err && !/no-speech/.test(err);
          const timeUp = performance.now() - t0 > maxMs;
          if (long && !s.userDone && !s.cancelled && !fatal && !timeUp) {
            if (got) parts.push(got[0]);
            lastAlts = null;
            setTimeout(() => { if (!s.userDone && !s.cancelled) startOne(); else finishAll(); }, 150);
            return;
          }
          if (got) lastAlts = got;
          if (!long && !got && !err && !s.userDone) err = ERR["no-speech"];
          finishAll();
        };
        try { r.start(); }
        catch (e) { err = "Không bật được mic: " + e.message; finishAll(); }
      };
      s.finishNow = finishAll;
      startOne();
    });
  }
  // Dừng nghe và lấy kết quả đã có (bấm Xong)
  function finish() {
    const s = session;
    if (!s) return;
    s.userDone = true;
    if (rec) { try { rec.stop(); } catch { s.finishNow(); } }
    else s.finishNow();
  }
  // Huỷ hẳn
  function stop() {
    const s = session;
    if (s) { s.cancelled = true; }
    if (rec) { const r = rec; rec = null; try { r.abort(); } catch {} }
    if (s) s.finishNow();
    if (recorder) recorder.cancel();
    stateCb && stateCb(false);
  }
  const isListening = () => !!session || !!recorder;

  // ---------- Ghi âm để gửi AI nghe (WAV 16kHz mono) ----------
  let recorder = null;
  async function record({ onLevel } = {}) {
    stop();
    if (hasTTS) speechSynthesis.cancel();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { throw new Error("Không mở được mic: " + e.name + ". Hãy cho phép Micrô cho trang này."); }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    const t0 = performance.now();
    const maxMs = (CONFIG.speech.maxListenSec || 90) * 1000;
    let resolveDone;
    const done = new Promise((r) => { resolveDone = r; });
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      if (onLevel) { let p = 0; for (let i = 0; i < d.length; i += 64) p = Math.max(p, Math.abs(d[i])); onLevel(p, (performance.now() - t0) / 1000); }
      if (performance.now() - t0 > maxMs) ctrl.stop();
    };
    src.connect(proc);
    proc.connect(ctx.destination);
    const cleanup = () => {
      try { proc.disconnect(); src.disconnect(); } catch {}
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      recorder = null;
      stateCb && stateCb(false);
    };
    const ctrl = {
      stop() {
        if (recorder !== ctrl) return done;
        cleanup();
        resolveDone({ wav: encodeWav(chunks, ctx.sampleRate, 16000), seconds: (performance.now() - t0) / 1000 });
        return done;
      },
      cancel() { if (recorder !== ctrl) return; cleanup(); resolveDone(null); },
      done
    };
    recorder = ctrl;
    stateCb && stateCb(true);
    return ctrl;
  }
  const isRecording = () => !!recorder;
  const stopRecording = () => recorder && recorder.stop();

  function encodeWav(chunks, inRate, outRate) {
    let len = 0; chunks.forEach((c) => { len += c.length; });
    const all = new Float32Array(len);
    let o = 0; chunks.forEach((c) => { all.set(c, o); o += c.length; });
    const ratio = inRate / outRate;
    const n = Math.floor(all.length / ratio);
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (p, s) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, outRate, true); v.setUint32(28, outRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      // lấy trung bình để giảm mẫu
      const a = Math.floor(i * ratio), b = Math.min(all.length, Math.floor((i + 1) * ratio));
      let sum = 0; for (let k = a; k < b; k++) sum += all[k];
      const x = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const onState = (cb) => { stateCb = cb; };

  // ---------- Kiểm tra mic ----------
  async function micTest(out) {
    out.textContent = "Đang mở mic…";
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { out.textContent = "❌ Không mở được mic: " + e.name + ". Hãy cho phép Micrô cho trang này."; return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let max = 0;
    const bar = document.createElement("div"); bar.className = "levelbar";
    const fill = document.createElement("div"); bar.append(fill);
    out.textContent = "Nói gì đó trong 5 giây…"; out.append(bar);
    const t0 = performance.now();
    await new Promise((done) => {
      (function tick() {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        max = Math.max(max, peak);
        fill.style.width = Math.min(100, peak / 0.8) + "%";
        if (performance.now() - t0 < 5000) requestAnimationFrame(tick); else done();
      })();
    });
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    out.textContent = max > 10 ? "✅ Mic thu được tiếng (mức " + max + "). Mic tốt."
      : "⚠️ Mic mở được nhưng gần như không có tiếng (mức " + max + ").";
  }

  return { speak, listen, finish, stop, isListening, record, isRecording, stopRecording, onState, score, bestScore, tokenize, micTest, lastLog, hasSR: () => !!getSR() };
})();
