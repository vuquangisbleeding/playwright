# Luồng Selenium của NZ WHS Filler

Tài liệu này diễn giải lại phần tự động hóa bằng Selenium trong thư mục `src/bot`. Pseudocode bên dưới mô tả ý tưởng và thứ tự xử lý, không phải mã chạy trực tiếp.

## 1. Mục tiêu

Bot Selenium tự động:

1. Mở Chrome và truy cập trang Working Holiday của Immigration New Zealand.
2. Đăng nhập bằng thông tin trong `.env`.
3. Vào hồ sơ hiện có hoặc bắt đầu hồ sơ mới.
4. Nhận diện từng trang của wizard.
5. Điền dữ liệu từ `applicant.json`.
6. Bấm `Next`, `Save`, `Submit`, `Pay Now` hoặc các nút cần thiết.
7. Tạm dừng để người dùng xử lý captcha khi cần.
8. Tự phục hồi khi INZ báo quá tải hoặc phiên đăng nhập hết hạn.
9. Dừng trước bước nhập thông tin thẻ.
10. Ghi log, thống kê thời gian và gửi thông báo Telegram sau khi hoàn tất.

## 2. Sơ đồ tổng quát

```text
main()
  |
  +-- khởi tạo logger và dữ liệu applicant
  |
  +-- đọc username/password từ .env
  |
  +-- createDriver()
  |
  +-- login()
  |     |
  |     +-- mở LOGIN_URL
  |     +-- kiểm tra captcha
  |     +-- điền username/password
  |     +-- bấm LOGIN
  |     +-- kiểm tra lỗi đăng nhập
  |     +-- chờ trang Working Holiday
  |
  +-- continueToApplication()
  |     |
  |     +-- nếu đã ở wizard: đi tới Personal1
  |     +-- nếu có hồ sơ Incomplete: mở hồ sơ
  |     +-- nếu có APPLY NOW: bắt đầu hồ sơ
  |     +-- nếu có danh sách quốc gia: chọn country rồi APPLY NOW
  |
  +-- walkWizard()
  |     |
  |     +-- detectPage()
  |     +-- recoverHighLoad()
  |     +-- fillCurrentPage()
  |     +-- click hành động tương ứng
  |     +-- lặp cho tới payment hoặc lỗi
  |
  +-- lấy URL cuối
  +-- ghi SUMMARY
  +-- gửi Telegram
```

## 3. Các module chính

| File | Trách nhiệm |
|---|---|
| `src/bot/login.ts` | Entrypoint, điều phối toàn bộ phiên chạy Selenium |
| `src/bot/driver.ts` | Tạo `WebDriver`, cấu hình Chrome và các hàm chờ chung |
| `src/bot/auth.ts` | Đăng nhập và xác nhận đăng nhập thành công |
| `src/bot/entry.ts` | Đi vào hồ sơ, chọn country, mở hồ sơ Incomplete hoặc APPLY NOW |
| `src/bot/wizard.ts` | Vòng lặp chính của các trang wizard |
| `src/bot/page.ts` | Nhận diện trang và trạng thái của INZ |
| `src/bot/forms.ts` | Mapping dữ liệu applicant vào các form |
| `src/bot/fill.ts` | Ghi text/select vào DOM và chờ ASP.NET postback |
| `src/bot/clicks.ts` | Bấm Next, Submit, Pay Now, OK, Payment Gateway |
| `src/bot/elements.ts` | Tìm element, kiểm tra hiển thị/click được, dump field lạ |
| `src/bot/captcha.ts` | Nhận diện captcha, tạo task CapSolver và chờ người dùng giải |
| `src/bot/recover.ts` | Refresh khi INZ quá tải và login lại nếu session hết hạn |
| `src/bot/declaration.ts` | Tick các checkbox declaration |
| `src/bot/logger.ts` | Ghi log file, status và thống kê captcha |
| `src/bot/applicant.ts` | Đọc `applicant.json` và credentials từ `.env` |
| `src/bot/constants.ts` | URL, timeout, locator và tên field dùng chung |

## 4. Khởi tạo WebDriver

### Hành vi hiện tại

`createDriver()` tạo Chrome bằng `selenium-webdriver` và `chrome.Options`:

- chiến lược tải trang là `eager`;
- mở Chrome ở trạng thái maximize;
- tắt một số dấu hiệu automation;
- bỏ switch `enable-automation`;
- bật `detach` để Chrome không tự đóng ngay sau khi tiến trình kết thúc;
- cấu hình ChromeDriver thông qua `Builder`.

### Pseudocode

```text
function createDriver(): WebDriver
    options = new ChromeOptions()
    options.pageLoadStrategy = "eager"
    options.addArgument("--start-maximized")
    options.addArgument("--disable-blink-features=AutomationControlled")
    options.excludeSwitch("enable-automation")
    options.setChromeOptions({
        useAutomationExtension: false,
        detach: true
    })

    return Builder()
        .forBrowser("chrome")
        .withChromeOptions(options)
        .build()
```

### Cơ chế chờ chung

Mọi thao tác Selenium nên đi qua `waiter(driver)` thay vì `sleep` cố định khi có thể.

```text
function waiter(driver, timeout = 30 seconds)
    return object with until(condition):
        driver.wait(condition, timeout, pollEvery = 100ms)

function waitReady(driver)
    wait until document.readyState is "interactive" or "complete"
```

## 5. Entrypoint `login.ts`

Đây là luồng cấp cao nhất.

```text
function main()
    logger = initRun(ROOT)
    applicantData = loadApplicant()
    setApplicant(applicantData)

    username, password = loadCredentials()
    driver = await createDriver()

    try
        await login(driver, username, password)
        await continueToApplication(driver)
        await walkWizard(driver)

        finalUrl = try driver.getCurrentUrl()
        write DONE log
        writeRunSummary(finalUrl)
        sendTelegramSummary(finalUrl)
        write "Chrome vẫn mở"

    catch error
        write FAIL log
        cố lấy URL hiện tại để ghi FAIL_URL
        write summary cuối cùng
        throw error
```

Bot không tự nhập thông tin thẻ. Khi nhận diện trang payment gateway có field thẻ, bot ghi log STOP và kết thúc wizard.

## 6. Đọc dữ liệu đầu vào

### Applicant

`loadApplicant()` đọc file:

```text
applicant = JSON.parse(ROOT + "/applicant.json")
```

Dữ liệu được lưu trong biến module thông qua `setApplicant()`. Các module form gọi `applicant()` để lấy cùng một bản dữ liệu trong suốt phiên chạy.

### Credentials

`loadCredentials()` đọc:

```text
INZ_USERNAME từ biến môi trường
INZ_PASSWORD từ biến môi trường
```

Nếu thiếu một trong hai giá trị, bot dừng ngay. Không ghi password vào log.

## 7. Đăng nhập

File: `src/bot/auth.ts`

### Trình tự

1. Mở `LOGIN_URL`.
2. Kiểm tra và chờ captcha nếu có.
3. Chờ input `[name="username"]` xuất hiện, hiển thị và bật.
4. Xóa rồi điền username.
5. Chờ input `[name="password"]` rồi điền password.
6. Tìm nút `LOGIN`.
7. Click nút.
8. Chờ một trong các kết quả:
   - thông báo lỗi đăng nhập xuất hiện;
   - input cũ biến mất do trang đã đổi.
9. Nếu có lỗi, ném exception.
10. Chờ URL đi tới `/WorkingHoliday/` hoặc trạng thái captcha.
11. Nếu gặp trang lỗi `aspxerrorpath` hoặc `formshelp/error`, mở lại trang Working Holiday.

### Pseudocode

```text
function login(driver, username, password)
    stats.login_started_at = now()
    log "Mở trang login"

    driver.get(LOGIN_URL)
    pauseForCaptcha(driver)

    userInput = wait until element located by name=username
    wait until userInput visible and enabled
    userInput.clear()
    userInput.sendKeys(username)

    passInput = wait until element located by name=password
    wait until passInput visible and enabled
    passInput.clear()
    passInput.sendKeys(password)

    loginButton = wait until LOGIN submit button exists
    wait until loginButton visible and enabled
    loginButton.click()

    wait until auth error exists OR old username input becomes stale
    waitReady(driver)
    pauseForCaptcha(driver)

    if visible auth error has text
        throw "Login failed: " + error message

    wait until URL contains WorkingHoliday OR captcha is active
    pauseForCaptcha(driver)

    if URL is an error page
        driver.get(WorkingHoliday homepage)
        waitReady(driver)
        pauseForCaptcha(driver)

    log success with current URL
```

## 8. Đi vào hồ sơ

File: `src/bot/entry.ts`

Sau login, bot chờ một trong các dấu hiệu sau:

- danh sách quốc gia;
- nút `APPLY NOW`;
- link hồ sơ Incomplete;
- field của wizard;
- URL chứa `Wizard/`.

### Các nhánh

#### Đã ở trong wizard

Nếu URL chứa `Wizard/` hoặc có field họ tên, bot gọi `goToPersonal1()`.

Hàm này lấy `ApplicationId` từ URL và điều hướng tới:

```text
/WorkingHoliday/Wizard/Personal1.aspx
    ?ApplicationId=...
    &IndividualType=Primary
    &IndividualIndex=1
```

#### Có hồ sơ Incomplete

Bot click link edit, chờ trang đổi, rồi đi tới `Personal1.aspx`.

#### Có APPLY NOW

Bot click `APPLY NOW`, chờ trang stale/ready/captcha, rồi đi tới `Personal1.aspx`.

#### Có danh sách country

Bot tìm country theo tên trong `applicant.scheme_country`, click phần tử tương ứng, chờ postback và captcha, sau đó click `APPLY NOW`.

### Pseudocode

```text
function continueToApplication(driver)
    waitReady(driver)
    pauseForCaptcha(driver)

    wait until page contains:
        country list OR APPLY NOW OR edit link OR wizard field OR Wizard URL

    if current URL contains Wizard OR has familyName field
        log "Đã ở trong form"
        goToPersonal1(driver)
        return

    if quota is closed
        throw quota error

    if existing application edit link exists
        click edit link and wait for page change
        goToPersonal1(driver)
        return

    if APPLY NOW exists
        click APPLY NOW
        goToPersonal1(driver)
        return

    if country list exists
        select applicant.scheme_country
        click APPLY NOW
        goToPersonal1(driver)
        return

    throw "Không tìm thấy điểm bắt đầu hồ sơ"
```

## 9. Nhận diện trang

File: `src/bot/page.ts`

`detectPage()` không chỉ dựa vào URL. Nó kết hợp:

- URL hiện tại;
- suffix của `id` field;
- text trên toàn trang;
- sự tồn tại của nút/link;
- iframe payment/captcha.

### Thứ tự ưu tiên nhận diện

Thứ tự này quan trọng vì một trang có thể đồng thời chứa nhiều dấu hiệu:

1. login;
2. high load;
3. payment card gateway;
4. payer name;
5. trang `NEXT STEP` tới payment;
6. trang `PAY NOW`;
7. declaration/Submit;
8. captcha;
9. Personal1;
10. Personal2;
11. Personal3;
12. Health;
13. Character;
14. WHS;
15. declaration fallback;
16. unknown.

### Bảng nhận diện

| Tên nội bộ | Dấu hiệu chính |
|---|---|
| `login` | Có input username và password, không ở Wizard |
| `highload` | Text INZ báo hệ thống quá tải |
| `payment` | URL/payment iframe/card number field |
| `payer` | Field payer name |
| `pay_next` | Link `onlinePaymentAnchor2`, `OnlinePayment.aspx`, hoặc text NEXT STEP/SECURE PAYMENT |
| `pay_now` | Link/nút PAY LATER hoặc URL submit received |
| `declaration` | URL Submit.aspx, checkbox declaration hoặc nút SUBMIT không có NEXT |
| `captcha` | URL/iframe captcha |
| `personal1` | URL Personal1 hoặc field family name |
| `personal2` | URL Personal2 hoặc field passport number |
| `personal3` | URL Personal3 |
| `health` | URL Medical/Health hoặc field renal dialysis |
| `character` | URL Character hoặc field imprisonment |
| `whs` | URL WorkingHolidaySpecific hoặc field WHS |
| `unknown` | Không khớp các nhận diện trên |

### Pseudocode

```text
function detectPage(driver)
    nếu không phải declaration checkbox
        pauseForCaptcha(driver)

    raiseIfQuotaClosed(driver)
    url = current URL

    if has username and password and not Wizard URL
        return "login"
    if isHighLoad(driver)
        return "highload"
    if isCardGateway(driver)
        return "payment"
    if has payer name field
        return "payer"
    if isPayNextPage(driver)
        return "pay_next"
    if isPayLaterPage(driver)
        return "pay_now"
    if Submit URL or declaration checkbox exists
        return "declaration"
    if isCaptcha(driver)
        return "captcha"
    if Personal1 condition
        return "personal1"
    ...
    return "unknown"
```

## 10. Vòng lặp wizard

File: `src/bot/wizard.ts`

Bot giới hạn tối đa `MAX_WIZARD_PAGES` vòng để tránh chạy vô hạn.

### Pseudocode

```text
function walkWizard(driver)
    visits = map URL -> number of visits

    repeat tối đa MAX_WIZARD_PAGES lần
        recovered = recoverHighLoad(driver)
        page = detectPage(driver)
        url = current URL
        log page number, page name, url

        if page == "highload"
            continue

        if page == "login"
            resumeSession(driver)
            recovered = true
            continue

        if URL đã xuất hiện ít nhất 2 lần và chưa recovery
            log "URL lặp lại, dừng"
            return

        tăng visits[url]
        action = fillCurrentPage(driver, page)

        if action == "stop"
            return
        if action == "submit"
            clickSubmit(driver)
            continue
        if action == "pay_now"
            clickPayNow(driver)
            continue
        if action == "pay_next"
            clickNextStep(driver)
            continue
        if action == "payer_ok"
            clickOk(driver)
            continue

        clickNext(driver)

    log "Đã đi hết giới hạn trang wizard"
```

## 11. Điền từng trang

File: `src/bot/wizard.ts`, `src/bot/forms.ts`

`fillCurrentPage()` chuyển tên trang thành hành động:

| Trang | Hành động |
|---|---|
| `personal1` | Điền thông tin cá nhân, địa chỉ, liên hệ |
| `personal2` | Điền passport và giấy tờ nhận dạng |
| `health` | Điền câu hỏi sức khỏe |
| `character` | Điền câu hỏi tiền án/nhân thân |
| `whs` | Điền thông tin Working Holiday |
| `personal3` | Dump field lạ rồi chỉ bấm Next |
| `declaration` | Tick checkbox rồi trả action Submit |
| `pay_now`, `pay` | Trả action Pay Now |
| `pay_next` | Trả action Next Step |
| `payer` | Điền tên người trả phí |
| `payment` | Dừng, không điền thông tin thẻ |
| trang lạ | Dump field và dừng |

### Cách mapping field

Bot dùng CSS selector theo suffix của `id`, ví dụ:

```text
[id$='familyNameTextBox']
[id$='passportNumberTextBox']
select[id$='renalDialysisDropDownList']
```

Cách này tránh phụ thuộc toàn bộ prefix động do ASP.NET tạo ra.

## 12. Cơ chế điền text/select

File: `src/bot/fill.ts`

### Text input

```text
if input.value khác giá trị mong muốn
    input.value = giá trị
    dispatch input event
    dispatch change event
    nếu có jQuery
        jQuery(input).val(value).trigger(change)
```

### Select

```text
wanted = trim giá trị cần chọn
option = tìm option có text == wanted hoặc value == wanted

if không tìm thấy option
    trả lỗi kèm danh sách options hiện có

if select đã có option.value
    ghi nhận unchanged
else
    select.value = option.value
    nếu có Select2/jQuery
        cập nhật bằng jQuery và trigger change
    ngược lại
        dispatch change event
```

### Field bắt buộc và tùy chọn

- Field bắt buộc không tìm thấy sẽ ném lỗi.
- Field tùy chọn có giá trị rỗng sẽ được bỏ qua.
- Mỗi field được ghi log là đã ghi, đã đúng hoặc bỏ qua.

### Postback ASP.NET

Một số select làm ASP.NET Web Forms postback.

```text
sau khi đổi select
    nếu element bị stale
        chờ DOM ready và captcha
        kết thúc

    nếu PageRequestManager đang async postback
        chờ tới khi isInAsyncPostBack == false
        chờ DOM ready và captcha
```

## 13. Các form được hỗ trợ

### Personal1

Điền:

- tên họ và tên;
- title, gender, date of birth;
- country of birth;
- địa chỉ;
- điện thoại, fax, email;
- communication method;
- có agent hay không;
- có credit card hay không.

### Personal2

Điền:

- passport number;
- confirm passport number;
- passport expiry;
- loại giấy tờ khác;
- ngày cấp và ngày hết hạn giấy tờ khác.

### Health

Điền các câu hỏi về:

- thận/dialysis;
- tuberculosis và TB risk;
- cancer;
- heart disease;
- disability;
- hospitalisation;
- residential care;
- pregnancy;
- medical details.

### Character

Điền các câu hỏi về:

- imprisonment 5 years/12 months;
- deported/removal;
- charged/convicted;
- under investigation;
- excluded/removed;
- character details.

### WHS

Điền:

- previous WHS visa;
- sufficient funds;
- intended travel date;
- từng tới New Zealand hay chưa;
- ngày từng tới New Zealand;
- onward ticket funds;
- meet scheme requirements;
- length of stay nếu có.

### Declaration

Bot tìm checkbox theo suffix đã biết, sau đó bổ sung tất cả checkbox trên trang và checkbox gắn với label `Yes`.

```text
for mỗi checkbox tìm được
    nếu disabled: bỏ qua
    nếu chưa checked: click
    nếu click không đủ: set checked + dispatch events

nếu không tick được checkbox nào
    dump field
    throw lỗi
```

## 14. Click và chờ chuyển trang

File: `src/bot/clicks.ts`, `src/bot/elements.ts`

### Nguyên tắc click

1. Tìm element theo danh sách locator.
2. Chỉ chọn element hiển thị và enabled.
3. Click bằng Selenium.
4. Nếu click thường lỗi, fallback sang JavaScript `arguments[0].click()`.
5. Chờ element stale nếu phù hợp.
6. Chờ document ready.
7. Chờ captcha.
8. Chờ URL đổi, captcha/high-load xuất hiện hoặc điều kiện hoàn tất đạt.
9. Nếu timeout, đọc validation message trên trang rồi ném lỗi.

### Click Next

```text
if tìm thấy nút Next
    clickControl(NEXT_LOCATORS, "NEXT")
else if có nút SAVE
    click SAVE
    đợi tối đa 10 giây:
        nếu Next xuất hiện: click Next
        nếu URL đổi: kết thúc
else if có SUBMIT
    click Submit
else
    throw không có Next/SAVE/SUBMIT
```

### Click Submit

Trước Submit, bot xử lý reCAPTCHA nếu response chưa có. Sau đó:

```text
if đã ở Submit Received
    trả "pay_now"

click SUBMIT
if sau click là trang Pay Now
    trả "pay_now"
ngược lại
    trả "ok"
```

### Click Payment

- `clickPayNow()` tìm text/label PAY NOW nhưng loại PAY LATER.
- `clickNextStep()` tìm link payment gateway hoặc `onlinePaymentAnchor2`.
- `clickOk()` tìm OK nhưng loại các nút PAY NOW, PAY LATER, NEXT STEP.
- `clickPayLater()` tìm PAY LATER nếu luồng cần dùng.

## 15. Captcha

File: `src/bot/captcha.ts`

### Nhận diện captcha

Bot kiểm tra:

- URL chứa `rs-captcha` hoặc `/captcha`;
- iframe đang hiển thị có source/title liên quan tới challenge;
- widget reCAPTCHA và textarea `g-recaptcha-response` chưa có token.

### Luồng xử lý

```text
function pauseForCaptcha(driver)
    if không phải captcha
        return

    captchaInfo = đọc pageURL và sitekey bằng executeScript
    tạo task CapSolver từ captchaInfo
    ghi log CAPTCHA_INFO
    ghi log PAUSE

    while captcha vẫn còn
        sleep theo CAPTCHA_POLL_SECONDS

    waitReady(driver)
    tính thời gian captcha
    tăng captcha_count và captcha_total
    ghi log captcha đã giải
```

Bot vẫn giữ Chrome mở trong lúc chờ. Người dùng có thể giải captcha trực tiếp trên cửa sổ Chrome.

### Captcha trước Submit

Nếu trang Submit có reCAPTCHA nhưng chưa có response:

```text
while response chưa hợp lệ và chưa chuyển sang challenge
    cố fillDeclaration(driver, quiet = true)
    sleep

if chuyển sang captcha challenge
    pauseForCaptcha(driver)

ghi lại thời gian captcha
```

## 16. Xử lý INZ quá tải

File: `src/bot/recover.ts`

`recoverHighLoad()` chạy khi trang chứa các cụm như:

- `site is under high load`;
- `high demand on the system`;
- `experiencing high demand`;
- `try again later` trong nội dung gần như chỉ là thông báo quá tải.

### Pseudocode

```text
function recoverHighLoad(driver)
    recovered = false
    tries = 0

    while isHighLoad(driver)
        kiểm tra quota đã đóng chưa
        tries += 1

        nếu lần đầu: refresh ngay
        nếu đang trong hồ sơ: chờ tăng dần, tối đa khoảng 3 giây
        nếu ngoài hồ sơ: chờ tăng dần, tối đa khoảng 5 giây

        refresh trang
        nếu refresh Selenium lỗi
            thử location.reload() bằng JavaScript
            nếu vẫn lỗi: driver.get(url cũ)

        waitReady(driver)
        pauseForCaptcha(driver)
        recovered = true

        if đã quay lại login
            resumeSession(driver)
            break

        kiểm tra quota

    return recovered
```

## 17. Hết session và login lại

Trong `walkWizard()`, nếu `detectPage()` trả `login`, bot gọi `resumeSession()`:

```text
function resumeSession(driver)
    đọc username/password từ .env
    log session hết hạn
    login(driver, username, password)
    continueToApplication(driver)
```

Khi resume, bot mở hồ sơ Incomplete và không tự gọi APPLY NOW.

## 18. Quota đóng

`raiseIfQuotaClosed()` đọc text trên trang và tìm các câu như:

- no places available;
- no places left;
- quota has been filled;
- applications are no longer being accepted.

Nếu tìm thấy, bot dừng bằng lỗi rõ ràng. Hồ sơ Incomplete không giữ chỗ quota đã mất.

## 19. Payment và điểm dừng an toàn

Luồng payment thường là:

```text
Declaration
  -> SUBMIT
  -> Submit Received / PAY NOW
  -> PAY NOW
  -> Payer Name
  -> OK
  -> NEXT STEP / Secure Payment
  -> Payment Gateway
```

Khi `isCardGateway()` nhận diện:

- URL Paystation/Paymark/PaymentExpress/PxPay;
- input card number;
- iframe payment;

bot trả page `payment`, ghi:

```text
STOP — Tới trang thanh toán thẻ. Không điền thẻ.
```

Đây là điểm dừng chủ động để không tự động xử lý thông tin thẻ.

## 20. Logger và thống kê

File: `src/bot/logger.ts`

Mỗi run tạo:

```text
logs/run-YYYYMMDD-HHMMSS.log
logs/latest.log
logs/status.json
```

Mỗi log có dạng:

```text
[HH:MM:SS] [LEVEL] STEP (duration) — message
```

Các level chính:

- `INFO`: thông tin tiến trình;
- `PAUSE`: captcha hoặc trạng thái cần chờ;
- `OK`: thao tác thành công;
- `ERROR`: lỗi.

`status.json` được cập nhật sau mỗi log để dashboard hiển thị:

- state;
- level;
- step;
- message;
- thời gian cập nhật;
- đường dẫn log.

`RunStats` lưu:

- thời điểm bắt đầu login;
- tổng thời gian captcha;
- số lần captcha;
- tổng thời gian chạy.

### Theo dõi thao tác bị treo

`withStuck(label, fn)` chạy timer song song với thao tác. Nếu chờ lâu, logger ghi các mốc STUCK sau khoảng 1, 2, 4 giây và tiếp tục theo bucket thời gian.

## 21. Các lỗi thường gặp

| Lỗi | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `Login failed` | Sai credentials hoặc tài khoản bị khóa | Kiểm tra `.env`, không ghi password vào log |
| `button not found` | DOM INZ thay đổi hoặc trang chưa ready | Kiểm tra locator và log UNKNOWN fields |
| `Field not found` | Field bắt buộc đổi id/suffix | Cập nhật mapping trong `forms.ts` |
| `Could not select` | Giá trị applicant không có trong option | Xem danh sách options trong lỗi |
| `Validation` | Trang không cho chuyển vì thiếu field | Đọc validation message trong log |
| `URL lặp lại` | Postback/navigation không tiến triển | Dừng để tránh click vô hạn |
| `HIGH_LOAD` | INZ quá tải | Bot refresh và retry có backoff |
| quota closed | Scheme đã hết chỗ | Dừng, chờ scheme mở lại |
| payment | Đã tới cổng thanh toán thẻ | Bot dừng, người dùng xử lý tiếp |

## 22. Pseudocode đầy đủ end-to-end

```text
function run()
    init logger
    load applicant.json
    load credentials from .env
    create Chrome WebDriver

    try
        login()
        enter application()

        for pageIndex from 1 to MAX_WIZARD_PAGES
            recover high-load if needed
            page = detect current page

            switch page
                case login:
                    login again
                    open Incomplete application

                case highload:
                    continue loop

                case personal1:
                    fill personal/address/contact
                    click Next

                case personal2:
                    fill passport/identity
                    click Next

                case health:
                    fill health
                    click Next

                case character:
                    fill character
                    click Next

                case whs:
                    fill Working Holiday data
                    click Next

                case personal3:
                    dump unknown fields
                    click Next

                case declaration:
                    tick declarations
                    solve/wait captcha if needed
                    click Submit

                case pay_now:
                    click Pay Now

                case payer:
                    fill payer name
                    click OK

                case pay_next:
                    click Secure Payment / Next Step

                case payment:
                    log STOP
                    return

                case unknown:
                    dump fields
                    log STOP
                    return

            if URL repeated too many times
                log STOP
                return

        log reached maximum page count

    catch error
        log FAIL and current URL
        rethrow

    finally or after success
        write summary
        send Telegram summary
        keep Chrome open
```

## 23. Lệnh chạy

Từ thư mục gốc project:

```bash
npm run bot
```

Hoặc chạy entrypoint tương đương bằng `tsx` nếu cần debug.

Dashboard hiện tại cũng có thể tạo tiến trình bot thông qua endpoint `/api/run`, nhưng phần Selenium cốt lõi vẫn bắt đầu từ `src/bot/login.ts`.

## 24. Giới hạn hiện tại

- Captcha không được coi là hoàn toàn tự động: bot có thể tạo task và theo dõi trạng thái, nhưng luồng vẫn chờ captcha hợp lệ trên browser.
- Bot không nhập số thẻ hoặc hoàn tất thanh toán thẻ.
- Mapping dựa trên suffix `id`; nếu INZ đổi field hoặc cấu trúc DOM, cần cập nhật locator.
- Website INZ có thể thay đổi URL, postback hoặc thông báo quá tải.
- Không nên chạy nhiều phiên cùng một hồ sơ INZ vì có thể gây click trùng, session conflict hoặc access denied.
- Credentials và API key phải được giữ trong `.env`/secret manager, không commit vào tài liệu hoặc git.
