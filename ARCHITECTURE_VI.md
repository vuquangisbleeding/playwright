# Kiến trúc và luồng chạy

Tài liệu này là bản đồ nhanh để phát triển và debug runner. Mã chạy bằng Node.js CommonJS, dùng Puppeteer, mỗi account có một Chrome profile riêng.

## 1. Điểm bắt đầu

```text
npm start
  -> src/runner.js
  -> src/main.js
  -> đọc .env, applicant.json, emails.json
  -> chạy song song một account trên mỗi Chrome profile
```

`src/runner.js` chỉ gọi `main()`. Logic điều phối nằm trong `src/main.js`, vì vậy khi debug lỗi khởi động hãy bắt đầu từ hai file này.

## 2. Luồng một account

```text
runAccount()
  -> launchBrowser()
  -> syncCapSolverApiKey()       nếu có CAPSOLVER_EXTENSION_PATH
  -> runApplicant()
      -> login()
      -> continueToApplication()
      -> walkWizard()
          -> recoverHighLoad()
          -> detectPage()
          -> xử lý trạng thái hiện tại
          -> fill form hoặc click action
          -> lặp đến khi dừng
```

Mỗi account clone dữ liệu applicant trước khi chạy và ghi đè `contact.email` bằng email của account. Dữ liệu gốc không bị sửa.

## 3. Trạng thái wizard

`src/detect.js` nhận diện theo thứ tự:

1. CAPTCHA.
2. Trang INZ quá tải.
3. Login hết session.
4. Payment gateway.
5. Trang kết quả submit hoặc bước payment.
6. Payer name.
7. Declaration/submit.
8. Personal, health, character và WHS.
9. `unknown` nếu không khớp.

Thứ tự này cần được giữ ổn định. Nếu website thay HTML, cập nhật selector tại `src/selectors/` trước khi sửa logic detect.

## 4. Nhóm mã nguồn

| Nhóm | File | Trách nhiệm |
|---|---|---|
| Khởi động | `src/runner.js`, `src/main.js` | đọc input, chạy song song, tổng kết |
| Cấu hình | `src/config.js` | biến môi trường và đường dẫn |
| Browser | `src/browser.js` | Chrome profile và CapSolver extension |
| Account | `src/account.js` | lifecycle và vòng lặp wizard |
| Điều hướng | `src/auth.js`, `src/entry.js`, `src/detect.js` | login, mở hồ sơ, nhận diện trang |
| Tương tác | `src/dom.js`, `src/actions.js` | tìm field, điền dữ liệu, click và Next |
| Form | `src/forms/` | mapping applicant vào từng màn hình |
| Khôi phục | `src/captcha.js`, `src/recovery.js` | CAPTCHA và high-load retry |
| Quan sát | `src/logger.js`, `src/notifications.js` | log file, account log, Telegram |
| Selector | `src/selectors/` | locator của INZ |

Mỗi file mã nguồn được giữ tối đa khoảng 200 dòng để dễ đọc nhưng không làm vỡ một flow nghiệp vụ chỉ vì giới hạn dòng.

## 5. Cách debug

### Login không thành công

Kiểm tra `LOGIN_URL`, username/password trong `emails.json`, rồi mở account log trong `logs/`. Các log quan trọng là `LOGIN_SKIP`, `LOGIN_OK`, `REQUEST_FAILED` và URL `NAVIGATE`.

### Không nhận diện được trang

Tìm `UNKNOWN_FIELDS` trong account log. Thêm selector vào file phù hợp trong `src/selectors/`, sau đó kiểm tra lại thứ tự trong `src/detect.js`.

### Field không được điền

Tìm `FIELD_SKIP_MISSING <fieldName>`. Đối chiếu tên job trong `src/forms/` với key selector trong `src/selectors/text.js` hoặc `src/selectors/select.js`.

### CAPTCHA hoặc high-load

`src/captcha.js` quản lý timeout và thống kê CAPTCHA. `src/recovery.js` quản lý số lần retry và backoff. Không giảm backoff quá thấp khi server đang quá tải.

### Dừng trước payment

Đây là hành vi có chủ ý trong `src/account.js`: trạng thái `payment` trả về `STOP_PAYMENT`, không nhập thông tin thẻ.

## 6. Kiểm tra trước khi chạy thật

```bash
find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check
node -e "require('./src/main'); console.log('main-load-ok')"
npm start
```

Hai lệnh đầu là kiểm tra tĩnh an toàn. `npm start` mở Chrome thật và nên chạy sau khi đã kiểm tra `.env`, `emails.json`, extension và Chrome profile.

## 7. Quy tắc khi mở rộng

- Không đưa credential hoặc API key vào source/docs.
- Form mới đặt trong `src/forms/`, không thêm logic form vào `main.js`.
- Selector mới đặt trong `src/selectors/`.
- Logic click dùng `src/actions.js` để vẫn có wait, recovery và CAPTCHA handling.
- Sau mỗi thay đổi chạy `node --check` và giữ file mã nguồn dưới khoảng 200 dòng khi hợp lý.