# English Buddy — app học tiếng Anh giao tiếp cá nhân

Đọc file này đầu mỗi buổi. Đầu buổi: `git pull` để lấy bản mới nhất.

## Người dùng
- Nói được câu tiếng Anh đơn giản; hướng nội → muốn luyện nói ngay trong app.
- Thời gian học không cố định. Dùng **Android + Chrome**. Muốn **miễn phí tối đa**.
- Sống ở Nha Trang, làm **kế toán** công ty cung cấp thực phẩm.
- Chủ đề thích: ăn uống, gym, văn hoá/thói quen các nước so với Việt Nam, business, trading/đầu tư.
- Cần thấy hứng thú mới học → ưu tiên thứ dùng được sớm.

## Cách làm việc với người dùng (vibe coding)
- KHÔNG giải thích code. Người dùng không đọc code.
- Báo cáo ngắn bằng **tiếng Việt**: vừa làm xong gì, cần thử gì, thử ở đâu.
- Tự lo kỹ thuật, tự chạy thử, tự sửa lỗi.
- Tự **commit và push** khi một việc xong và chạy được.
- Chỉ hỏi khi cần quyết định tính năng/giao diện, hoặc cần người dùng làm gì trên web (vd lấy API key).

## Lộ trình học
- **Chặng 1 "Nói về mình"** (~3 tuần): giới thiệu bản thân, công việc, gym, đồ ăn. Mục tiêu: nói liền 1–2 phút.
- **Chặng 2 "Hỏi và so sánh"** (~4 tuần): hỏi người khác về nước họ, so sánh thói quen với VN. Mục tiêu: duy trì hội thoại 5 phút.
- **Chặng 3 "Bàn chuyện"** (~5 tuần): business/trading, nêu ý kiến.
- **Xuyên suốt**: gói tình huống du lịch (sân bay, khách sạn, nhà hàng, hỏi đường).

## Lộ trình app
- **v0.1** (buổi 1, gọn): kho câu mẫu + nghe mẫu + nói và chấm điểm khớp. Mục đích chính: kiểm tra mic và nhận giọng nói chạy tốt trên điện thoại.
- **v0.2** (buổi 2, LÀM NGAY SAU v0.1 — phần cốt lõi): trò chuyện bằng giọng nói với nhân vật AI có quốc tịch riêng
  (Mike – khách Úc du lịch Nha Trang, Yuki – Nhật, Tom – trader London...). Nhân vật kể thói quen nước họ, hỏi về VN,
  nói chậm, đơn giản, hợp trình độ.
  - Dùng **Gemini API gói miễn phí, model Flash-Lite**.
  - Nút **"Nói tiếng Việt"** khi bí từ: tạm chuyển nhận giọng sang vi-VN → trả về cách nói chuẩn + cách nói đơn giản, đọc mẫu để người dùng nói lại.
  - Người dùng hỏi "How do you say...?" → nhân vật giúp tự nhiên.
  - Nút **"Gợi ý"**: 2–3 câu đáp mẫu từ dễ đến khó.
  - Hiển thị **số lượt API đã dùng trong ngày**.
  - Màn hình **Cài đặt** để dán API key.
- **v0.3**: ôn câu theo lặp lại ngắt quãng (SRS); phiên luyện 3 phút; sổ "câu tôi nói sai" (sau mỗi cuộc trò chuyện AI chỉ ra 2–3 câu nên nói tự nhiên hơn) + từ từng bí tự vào sổ ôn; chấm phát âm bằng **Azure AI Speech (gói F0 miễn phí)**.
- **v0.4**: thẻ văn hoá "Bạn có biết?", thống kê tiến bộ. **Không phạt khi bỏ ngày học.**

## Quy tắc kỹ thuật
- HTML/CSS/JavaScript thuần, **không bước build**.
- Giao diện ưu tiên điện thoại, nút to dễ bấm.
- Thông số gom vào khối `CONFIG` (trong `js/config.js`).
- Nội dung bài học và nhân vật nằm trong **file JSON riêng** (`data/`).
- Nhà cung cấp AI đổi được bằng **1 dòng CONFIG**.
- Dữ liệu lưu trên máy (localStorage).
- **KHÔNG BAO GIỜ ghi API key vào code hay commit** — key chỉ lưu trên điện thoại (localStorage).
- Repo công khai `english-buddy`, host bằng **GitHub Pages** (nhánh `main`, thư mục gốc).
- Khi sửa JS/CSS, tăng `?v=` trong index.html để điện thoại không dùng bản cũ trong bộ nhớ đệm.
- Nhận giọng nói: Web Speech API (`webkitSpeechRecognition`), đọc mẫu: `speechSynthesis`. Cần HTTPS (GitHub Pages ok) hoặc localhost.
- Điện thoại người dùng (Android 10): nhận giọng nói từng không chạy (chỉ có "start", không "audiostart") cho tới khi
  dịch vụ giọng nói Google trên máy hoạt động; sau đó chạy cả trên Chrome lẫn Brave. Nếu tái diễn: kiểm tra
  "Speech Services by Google"/app Google. Phương án dự phòng chưa làm: ghi âm (MediaRecorder) gửi Gemini chuyển thành chữ.

## Cấu trúc code
- `index.html` → nạp `js/config.js` (CONFIG), `js/speech.js` (đọc/nghe/chấm điểm), `js/ai.js` (nhà cung cấp AI + lời nhắc nhân vật + đếm lượt), `js/app.js` (giao diện).
- `data/phrases.json` (câu mẫu), `data/characters.json` (nhân vật: persona, giọng, câu mở đầu + gợi ý).
- Gemini: key trong localStorage `englishBuddy.apiKey.gemini`. Model mặc định gemini-3.5-flash-lite (2.5 đã ngừng cho người dùng mới, 11/2026). Gặp lỗi 404 model → app ghi model vào danh sách chặn và tự chọn Flash-Lite khác qua ListModels.
- Giọng Anh đọc từ Việt (Nha Trang, pho...) bằng bảng `CONFIG.speech.pronounce` (chỉ đổi tiếng đọc). Trả JSON theo responseSchema; mỗi lượt chat trả luôn 3 gợi ý (nút Gợi ý không tốn lượt).
- Mở đầu cuộc trò chuyện lấy từ JSON (không tốn lượt API).
- Nghe khi trò chuyện: không tự ngắt khi người dùng dừng suy nghĩ (Speech.listen long:true tự khởi động lại, ghép các đoạn; bấm lại nút = Xong).
- Cài đặt "Ai nghe giọng bạn": `device` (Web Speech, miễn phí) hoặc `ai` (ghi WAV 16kHz gửi kèm lượt chat cho Gemini, trả trường `heard`; không tốn thêm lượt). Người dùng phàn nàn điện thoại nghe sai tên/địa danh → chế độ `ai` để khắc phục.

## Lưu ý máy Windows của người dùng
- Trong `C:\Users\Admin\OneDrive` có HAI thư mục tên "Tài liệu" (khác kiểu mã hoá dấu Unicode). Repo thật nằm trong thư mục
  có `index.html`; shell có thể mở nhầm thư mục rỗng → luôn kiểm tra có `index.html` trước khi chạy lệnh.
- Chạy thử trên máy: `python -m http.server 8080 --directory <thư mục repo>` rồi mở http://127.0.0.1:8080.
- gh cài ở `C:\Program Files\GitHub CLI\gh.exe` (có thể chưa có trong PATH của phiên cũ).

## Trạng thái
- Xem mục "Nhật ký" bên dưới, cập nhật mỗi buổi.

## Nhật ký
- Repo: https://github.com/phim10a4/english-buddy — App: https://phim10a4.github.io/english-buddy/
- Git trong repo dùng email noreply của GitHub (không dùng email cá nhân).
- 2026-11-21: tạo CLAUDE.md, repo, làm v0.1, bật GitHub Pages. Mic xác nhận chạy trên Android.
- 2026-11-21: làm v0.2 (tab Trò chuyện/Câu mẫu/Cài đặt; Mike/Yuki/Tom; Gợi ý; Nói tiếng Việt; đếm lượt AI; dán key).
  Đã thử với Gemini giả lập; CHƯA thử với key thật → buổi sau hỏi người dùng kết quả. Tiếp theo: v0.3.
- 2026-11-26: sửa model Gemini bị ngừng (tự chọn model khác), cách đọc từ Việt, nghe không tự ngắt, thêm chế độ Gemini nghe. Chờ người dùng thử chế độ Gemini nghe với key thật.
