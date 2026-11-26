// Mọi thông số của app gom vào đây.
const CONFIG = {
  version: "0.2",
  defaultName: "Nam",            // tên mặc định trong câu mẫu, đổi được trong Cài đặt
  phrasesFile: "data/phrases.json",
  charactersFile: "data/characters.json",

  // ---- AI: đổi nhà cung cấp bằng 1 dòng ----
  ai: {
    provider: "gemini",          // tên nhà cung cấp, xem js/ai.js
    temperature: 0.8,
    historyTurns: 16,            // số lượt gần nhất gửi kèm để AI nhớ ngữ cảnh
    gemini: {
      model: "gemini-3.5-flash-lite",   // model ưu tiên; nếu không dùng được, app tự chọn bản Flash-Lite mới nhất
      autoPickModel: true,
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      keyUrl: "https://aistudio.google.com/apikey"
    }
  },

  learner: {
    level: "A2 (simple sentences)",
    about: "an accountant at a food supply company in Nha Trang, Vietnam. Likes food, the gym, cultural differences between countries and Vietnam, business, trading and investing."
  },

  speech: {
    listenLang: "en-US",         // ngôn ngữ nhận giọng tiếng Anh
    vietLang: "vi-VN",           // nhận giọng khi bấm "Nói tiếng Việt"
    voiceLang: "en-US",          // giọng đọc mẫu mặc định
    rateNormal: 0.9,             // tốc độ đọc câu mẫu
    rateSlow: 0.65,              // tốc độ đọc chậm
    rateChat: 0.85,              // tốc độ nhân vật nói (chỉnh trong Cài đặt)
    maxAlternatives: 5,
    maxListenSec: 90,            // nghe/ghi âm tối đa mỗi lượt
    hearModeDefault: "device",   // "device" = điện thoại nhận giọng (miễn phí) · "ai" = gửi giọng cho Gemini nghe
    // Cách đọc từ tiếng Việt cho giọng tiếng Anh (chỉ ảnh hưởng tiếng đọc, không đổi chữ hiển thị)
    pronounce: {
      "Nha Trang": "Nyah Trahng",
      "Vietnam": "Viet Nahm",
      "Vietnamese": "Viet nah meez",
      "banh mi": "bahn mee",
      "pho": "fuh",
      "bun cha": "boon chah",
      "Hanoi": "Ha noy",
      "Ho Chi Minh": "Ho Chee Min",
      "Da Lat": "Dah Laht",
      "ao dai": "ow zai"
    }
  },

  scoring: {
    good: 85,                    // >= : xanh
    ok: 60                       // >= : vàng, dưới: đỏ
  },

  storageKey: "englishBuddy",    // khoá lưu dữ liệu trên máy
  keyStoragePrefix: "englishBuddy.apiKey."   // API key lưu riêng trên máy, KHÔNG BAO GIỜ ghi vào code
};
