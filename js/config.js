// Mọi thông số của app gom vào đây.
const CONFIG = {
  version: "0.1",
  defaultName: "Nam",            // tên mặc định trong câu mẫu, đổi được trong app
  phrasesFile: "data/phrases.json",

  speech: {
    listenLang: "en-US",         // ngôn ngữ nhận giọng nói
    voiceLang: "en-US",          // giọng đọc mẫu
    rateNormal: 0.9,             // tốc độ đọc bình thường
    rateSlow: 0.65,              // tốc độ đọc chậm
    maxAlternatives: 5
  },

  scoring: {
    good: 85,                    // >= : màu xanh
    ok: 60                       // >= : màu vàng, dưới: đỏ
  },

  storageKey: "englishBuddy"     // khoá lưu dữ liệu trên máy
};
