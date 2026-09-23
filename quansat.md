

## 5. Bước 2: mở trang login

File:

```text
src/bot/auth.ts
```

URL:

```text
https://onlineservices.immigration.govt.nz/?WHS
```

### Trình tự quan sát

```text
[INFO] LOGIN — Mở https://onlineservices.immigration.govt.nz/?WHS
```

Sau đó bot:

1. `driver.get(LOGIN_URL)`.
2. Gọi `pauseForCaptcha(driver)`.
3. Chờ input username.
4. Chờ input password.
5. Chờ nút LOGIN.

### Điều kiện trang login được coi là sẵn sàng

- Có element `[name='username']`.
- Có element `[name='password']`.
- Element hiển thị.
- Element enabled.

Nếu chưa có, bot không điền ngay mà tiếp tục chờ tới timeout.

---

## 6. Bước 3: điền username và password

### Username

Locator ưu tiên duy nhất:

```css
input[name="username"]
```

Giá trị:

```text
process.env.INZ_USERNAME
```

Thao tác:

```text
wait username visible
wait username enabled
clear username
sendKeys(username)
```

### Password

Locator ưu tiên duy nhất:

```css
input[name="password"]
```

Giá trị:

```text
process.env.INZ_PASSWORD
```

Thao tác:

```text
wait password visible
wait password enabled
clear password
sendKeys(password)
```

### Không được log

Không log:

- password;
- full credential object;
- cookie/session token.

### Dấu hiệu thành công

Bot tiếp tục tìm nút LOGIN.

### Dấu hiệu lỗi

- Không tìm thấy username/password: timeout.
- Element disabled: tiếp tục chờ.
- Trang đổi trước khi điền: cần xem lại captcha hoặc redirect.

---

## 7. Bước 4: ưu tiên nút LOGIN

Locator:

```css
input.button-large-primary[type="submit"][value="LOGIN"]
```

Thứ tự:

```text
1. tìm element LOGIN
2. chờ hiển thị
3. chờ enabled
4. click bằng Selenium
5. chờ kết quả login
```

Log trước click:

```text
[INFO] LOGIN — Bấm LOGIN
```

Sau click, bot chờ một trong hai sự kiện:

```text
A. authenticationErrorLabel xuất hiện có nội dung
B. username input cũ không còn truy cập được
```

### Nếu login thất bại

Bot đọc:

```text
[id="authenticationErrorLabel"]
```

Nếu có text hiển thị:

```text
throw Login failed: <message>
```

Log cần tìm:

```text
[ERROR] FAIL — Error: Login failed: ...
```

### Nếu login thành công

Bot chờ URL chứa một trong các dấu hiệu:

```text
/WorkingHoliday/
aspxerrorpath
captcha
```

Nếu URL là trang lỗi `aspxerrorpath` hoặc `formshelp/error`, bot mở lại trang Working Holiday homepage.

Log thành công:

```text
[OK] LOGIN — <current URL>
```

---

## 8. Bước 5: xử lý captcha

File:

```text
src/bot/captcha.ts
```

### Khi nào bot nhận diện captcha

Bot kiểm tra:

1. URL chứa `rs-captcha`.
2. URL chứa `/captcha`.
3. iframe đang hiển thị có source chứa `bframe` hoặc `rs-captcha`.
4. iframe title chứa `challenge` hoặc `rs-captcha`.
5. reCAPTCHA có `g-recaptcha-response` rỗng.

### Khi captcha xuất hiện

```text
[PAUSE] CAPTCHA_INFO — pageURL=... | data-sitekey=...
[PAUSE] CAPTCHA — Tạm dừng. Hãy giải captcha trên cửa sổ Chrome...
```

Bot sẽ:

```text
1. đọc pageURL
2. đọc sitekey
3. tạo task captcha
4. giữ Chrome mở
5. kiểm tra captcha định kỳ mỗi 2 giây
6. khi captcha biến mất -> waitReady
7. ghi thời gian captcha
8. tiếp tục bước đang dở
```

Không bấm nút Next/Submit trong lúc captcha chưa hoàn tất.

---

## 9. Bước 6: vào hồ sơ

File:

```text
src/bot/entry.ts
```

Sau login, bot chờ một trong các dấu hiệu:

```text
1. danh sách country
2. APPLY NOW
3. link hồ sơ Incomplete
4. field familyName
5. URL chứa Wizard/
```

### Ưu tiên nhánh vào hồ sơ

Thứ tự thực tế:

```text
1. Nếu đã ở Wizard hoặc có familyName -> đi tới Personal1
2. Kiểm tra quota đóng
3. Nếu có hồ sơ Incomplete -> mở hồ sơ đó -> Personal1
4. Nếu có APPLY NOW -> bấm APPLY NOW -> Personal1
5. Nếu có country list -> chọn scheme_country -> APPLY NOW -> Personal1
6. Nếu không khớp -> lỗi
```

### Nhánh 1: đã ở wizard

Điều kiện:

```text
current URL chứa Wizard/
hoặc có field [id$='familyNameTextBox']
```

Bot gọi `goToPersonal1()`.

Nếu URL đã là `Personal1.aspx`, không điều hướng lại.

Nếu có `ApplicationId`, bot tạo URL:

```text
/WorkingHoliday/Wizard/Personal1.aspx
?ApplicationId=<id>
&IndividualType=Primary
&IndividualIndex=1
```

### Nhánh 2: hồ sơ Incomplete

Locator:

```css
a[id^='ContentPlaceHolder1_applicationList_applicationsDataGrid_editHyperLink_']
```

Thao tác:

```text
click link edit
wait element stale
wait document ready
wait captcha
goToPersonal1()
```

### Nhánh 3: APPLY NOW

Locator:

```css
#ContentPlaceHolder1_applyNowButton
```

Thao tác:

```text
click APPLY NOW
wait element stale
wait document ready
wait captcha
goToPersonal1()
```

### Nhánh 4: chọn country

Locator danh sách:

```css
[id^='ContentPlaceHolder1_countryRepeater_countryName_']
```

Giá trị:

```text
applicant.scheme_country
```

XPath tìm country:

```text
span có id bắt đầu ContentPlaceHolder1_countryRepeater_countryName_
và text đúng với scheme_country
```

Element được click là ancestor:

```xpath
ancestor::div[contains(@class,'category-item-footer')]
```

Sau click:

```text
wait element stale
wait document ready
wait captcha
click APPLY NOW
```

---

## 10. Bước 7: vòng lặp nhận diện trang

File:

```text
src/bot/wizard.ts
src/bot/page.ts
```

Mỗi vòng bot ghi:

```text
[INFO] PAGE — <số thứ tự>. <page name> | <URL>
```

Ví dụ:

```text
[INFO] PAGE — 1. personal1 | https://...
```

### Thứ tự nhận diện page

Đây là thứ tự ưu tiên thật trong `detectPage()`:

```text
1. login
2. highload
3. payment
4. payer
5. pay_next
6. pay_now
7. declaration
8. captcha
9. personal1
10. personal2
11. personal3
12. health
13. character
14. whs
15. declaration fallback
16. unknown
```

### Ý nghĩa từng page

| Page | Điều kiện nhận diện | Hành động sau đó |
|---|---|---|
| `login` | Có username + password, không ở Wizard | Login lại |
| `highload` | Text INZ báo quá tải | Refresh/recover |
| `payment` | Có card field, payment iframe hoặc URL gateway | Dừng, không điền thẻ |
| `payer` | Có field payer name | Điền payer name -> OK |
| `pay_next` | Có link online payment/NEXT STEP | Bấm Next Step |
| `pay_now` | Có PAY LATER hoặc Submit Received | Bấm PAY NOW |
| `declaration` | Submit.aspx, checkbox declaration hoặc Submit | Tick checkbox -> Submit |
| `captcha` | URL/iframe captcha | Chờ captcha |
| `personal1` | Personal1 hoặc family name field | Điền Personal1 -> Next |
| `personal2` | Personal2 hoặc passport field | Điền identification -> Next |
| `personal3` | Personal3.aspx | Dump field -> Next |
| `health` | Medical/Health hoặc renal field | Điền health -> Next |
| `character` | Character hoặc imprisonment field | Điền character -> Next |
| `whs` | WorkingHolidaySpecific hoặc WHS field | Điền WHS -> Next |
| `unknown` | Không khớp | Dump field -> dừng |

---

## 11. Bước 8: Personal1

Hàm:

```text
fillPersonal1(driver)
```

Nguồn dữ liệu:

```text
applicant.personal
applicant.address
applicant.contact
```

### Thứ tự field và giá trị

| Thứ tự | Loại | Nguồn giá trị | Locator suffix | Bắt buộc |
|---:|---|---|---|---|
| 1 | select | `contact.has_agent` | `representedByAgentDropdownlist` | Có |
| 2 | text | `personal.family_name` | `familyNameTextBox` | Có |
| 3 | text | `personal.given_name_1` | `givenName1Textbox`, `givenName1TextBox` | Có |
| 4 | text | `personal.given_name_2` | `givenName2Textbox`, `givenName2TextBox` | Không |
| 5 | text | `personal.given_name_3` | `givenName3Textbox`, `givenName3TextBox` | Không |
| 6 | text | `personal.other_names` | `otherNamesTextBox` | Không |
| 7 | select | `personal.title` | `titleDropDownList` | Có |
| 8 | text | `personal.other_title` | `otherTitleTextBox` | Không |
| 9 | select | `personal.gender` | `genderDropDownList` | Có |
| 10 | text | `personal.date_of_birth` | `dateOfBirthDatePicker_DatePicker` | Có |
| 11 | select | `personal.country_of_birth` | `personDetails_CountryDropDownList` | Có |
| 12 | text | `address.street_number` | `streetNumberTextbox`, `streetNumberTextBox` | Có |
| 13 | text | `address.street_name` | `address1TextBox` | Có |
| 14 | text | `address.suburb` | `suburbTextBox` | Có |
| 15 | text | `address.city` | `cityTextBox` | Có |
| 16 | text | `address.province` | `provinceStateTextBox` | Có |
| 17 | text | `address.postal_code` | `postalCodeTextBox` | Có |
| 18 | select | `address.country` | `address_countryDropDownList` | Có |
| 19 | text | `contact.phone_daytime` | `phoneNumberTextBox` | Không |
| 20 | text | `contact.phone_night` | `phoneNumberNightTextBox` | Không |
| 21 | text | `contact.phone_mobile` | `phoneNumberMobileTextBox` | Có |
| 22 | text | `contact.fax` | `faxNumberTextbox`, `faxNumberTextBox` | Không |
| 23 | text | `contact.email` | `emailAddressTextBox` | Có |
| 24 | select | `contact.communication_method` | `communicationMethodDropDownList` | Có |
| 25 | select | `contact.has_credit_card` | `hasCreditCardDropDownlist` | Có |

### Thứ tự thao tác đặc biệt

`representedByAgentDropdownlist` được chọn trước các field còn lại vì có thể tạo ASP.NET postback.

```text
1. chọn has_agent
2. chờ postback nếu có
3. chờ familyNameTextBox
4. điền các field còn lại theo bảng
```

### Log thành công

```text
[OK] FILL_PERSONAL1 — Tên, địa chỉ, liên hệ
```

### Nút sau Personal1

Ưu tiên nút:

```text
1. NEXT bằng các locator trong NEXT_LOCATORS
2. nếu không có Next -> SAVE
3. sau SAVE, nếu Next xuất hiện -> NEXT
4. nếu không có Next/SAVE nhưng có SUBMIT -> SUBMIT
5. nếu không có cả ba -> lỗi
```

---

## 12. Bước 9: Personal2 / Identification

Hàm:

```text
fillIdentification(driver)
```

Nguồn:

```text
applicant.identification
```

### Thứ tự field

| Thứ tự | Loại | Nguồn giá trị | Locator suffix | Bắt buộc |
|---:|---|---|---|---|
| 1 | text | `identification.passport_number` | `passportNumberTextBox` | Có |
| 2 | text | `identification.passport_number` | `confirmPassportNumberTextBox` | Có |
| 3 | text | `identification.passport_expiry` | `passportExpiryDateDatePicker_DatePicker` | Có |
| 4 | select | `identification.id_type` | `otherIdentificationDropdownlist` | Có |
| 5 | text | `identification.id_issue_date` | `otherIssueDateDatePicker_DatePicker` | Có |
| 6 | text | `identification.id_expiry_date` | `otherExpiryDateDatePicker_DatePicker` | Có |

### Điều kiện bắt đầu

Bot chờ:

```css
[id$='passportNumberTextBox']
```

### Log thành công

```text
[OK] FILL_IDENTIFICATION — Passport + National ID
```

### Nút sau Personal2

```text
NEXT
-> nếu không có Next: SAVE
-> nếu SAVE xong có Next: NEXT
-> nếu có SUBMIT: SUBMIT
```

---

## 13. Bước 10: Health

Hàm:

```text
fillHealth(driver)
```

Nguồn:

```text
applicant.health
```

### Thứ tự field

| Thứ tự | Loại | Nguồn giá trị | Locator suffix | Bắt buộc |
|---:|---|---|---|---|
| 1 | select | `health.renal_dialysis` | `renalDialysisDropDownList` | Có |
| 2 | select | `health.active_tb` | `tuberculosisDropDownList` | Có |
| 3 | select | `health.cancer` | `cancerDropDownList` | Có |
| 4 | select | `health.heart_disease` | `heartDiseaseDropDownList` | Có |
| 5 | select | `health.disability` | `disabilityDropDownList` | Có |
| 6 | select | `health.hospitalisation` | `hospitalisationDropDownList` | Có |
| 7 | select | `health.residential_care` | `residentailCareDropDownList`, `residentialCareDropDownList` | Có |
| 8 | select | `health.pregnancy` hoặc `No` | `pregnancyStatusDropDownList` | Không |
| 9 | select | `health.tb_risk` | `tbRiskDropDownList` | Có |
| 10 | text | `health.medical_details` | `medicalConditionsTextBox` | Không |

### Thứ tự đặc biệt

`tbRiskDropDownList` được chọn sau nhóm select đầu tiên và được chờ postback.

### Log thành công

```text
[OK] FILL_HEALTH — TB risk=<value>
```

### Giá trị thường gặp

Các field Yes/No phải khớp text hoặc value của option:

```text
Yes
No
```

Không tự đổi `Yes` thành `true` hoặc `1` nếu option trên trang không dùng giá trị đó.

---

## 14. Bước 11: Character

Hàm:

```text
fillCharacter(driver)
```

Nguồn:

```text
applicant.character
```

### Thứ tự field

| Thứ tự | Loại | Nguồn giá trị | Locator suffix | Bắt buộc |
|---:|---|---|---|---|
| 1 | select | `character.imprisonment_5_years` | `imprisonment5YearsDropDownList` | Có |
| 2 | select | `character.imprisonment_12_months` | `imprisonment12MonthsDropDownList` | Có |
| 3 | select | `character.deported` | `deportedDropDownList` | Có |
| 4 | select | `character.removal_order` hoặc `No` | `removalOrderDropDownList` | Không |
| 5 | select | `character.charged` | `chargedDropDownList` | Có |
| 6 | select | `character.convicted` | `convictedDropDownList` | Có |
| 7 | select | `character.under_investigation` | `underInvestigationDropDownList` | Có |
| 8 | select | `character.excluded` | `excludedDropDownList` | Có |
| 9 | select | `character.removed` | `removedDropDownList` | Có |
| 10 | text | `character.details` | `characterDetailsTextBox` | Không |

### Log thành công

```text
[OK] FILL_CHARACTER — Tất cả No
```

Nội dung message hiện tại là cố định, không có nghĩa mọi applicant luôn có toàn bộ giá trị là `No`; muốn biết giá trị từng field xem các dòng `FILL` trước đó.

---

## 15. Bước 12: WHS Specific

Hàm:

```text
fillWhs(driver)
```

Nguồn:

```text
applicant.whs
```

Nếu thiếu một giá trị WHS, bot dùng `DEFAULT_WHS`.

### Thứ tự field

| Thứ tự | Loại | Nguồn giá trị | Locator suffix | Bắt buộc |
|---:|---|---|---|---|
| 1 | select | `whs.previous_whs_visa` hoặc default | `previousWhsPermitVisaDropDownList` | Có |
| 2 | select | `whs.sufficient_funds_holiday` hoặc default | `sufficientFundsHolidayDropDownList` | Có |
| 3 | text | `whs.travel_date` hoặc default | `intendedTravelDateDatePicker_DatePicker` | Có |
| 4 | select | `whs.been_to_nz` hoặc default | `beenToNzDropDownList` | Có |
| 5 | text | `whs.been_to_nz_when` | `beenToNzDateDatePicker_DatePicker`, `whenInNzDatePicker_DatePicker` | Không |
| 6 | select | `whs.sufficient_funds_onward_ticket` hoặc default | `sufficientFundsOnwardTicketDropDownList` | Có |
| 7 | select | `whs.meet_scheme_requirements` hoặc default | `readRequirementsDropDownList` | Có |
| 8 | select | `whs.length_of_stay` | `lengthOfStayDropDownList` | Không |

### Thứ tự postback

`beenToNzDropDownList` được chọn riêng và chờ postback trước khi điền ngày `been_to_nz_when`.

### Log thành công

```text
[OK] FILL_WHS — Travel <travel_date>
```

---

## 16. Bước 13: Personal3

Hiện tại chưa có mapping field riêng cho Personal3.

Bot làm:

```text
1. lấy danh sách input/select/textarea không hidden
2. ghi tối đa 40 field vào log UNKNOWN_PERSONAL3
3. ghi PERSONAL3 — Không có mapping field — bấm Next
4. bấm Next theo thứ tự ưu tiên
```

Log cần quan sát:

```text
[INFO] UNKNOWN_PERSONAL3 — URL=... fields=...
[INFO] PERSONAL3 — Không có mapping field — bấm Next
```

Nếu Personal3 thực tế cần điền dữ liệu, không nên tự bấm tiếp; cần bổ sung mapping trước.

---

## 17. Bước 14: Declaration

Hàm:

```text
fillDeclaration(driver)
```

### Điều kiện bắt đầu

Chờ một trong các điều kiện:

```text
1. có input checkbox
2. có input value=SUBMIT
3. URL chứa Submit.aspx
```

### Thứ tự tìm checkbox

1. Tìm checkbox theo các suffix khai báo đã biết:

```text
falseStatementCheckBox
notesCheckBox
circumstancesCheckBox
warrantsCheckBox
informationCheckBox
healthCheckBox
adviceCheckBox
registrationCheckBox
entitlementCheckbox
entitlementCheckBox
permitExpiryCheckBox
medicalInsuranceCheckBox
```

2. Bổ sung tất cả `input[type='checkbox']` còn lại.
3. Bổ sung checkbox nằm trong label có text chính xác `Yes`.
4. Loại bỏ phần tử trùng bằng Set.

### Cách tick

```text
nếu disabled -> bỏ qua
nếu đã checked -> giữ nguyên
nếu chưa checked -> click
nếu click không làm checked:
    set checked = true
    dispatch click
    dispatch input
    dispatch change
    nếu có jQuery -> trigger click/change
nếu vẫn chưa checked:
    tìm label[for=id] và click label
```

### Kết quả

Log:

```text
[OK] FILL_DECLARATION — Đã tick <checked>/<total> ô Yes
```

Nếu còn checkbox chưa tick:

```text
[INFO] DECLARATION_UNCHECKED — <list>
```

Nếu không tick được checkbox nào:

```text
UNKNOWN_DECLARATION
ERROR — Không tìm thấy checkbox declaration để tick Yes
```

### Nút sau Declaration

Ưu tiên:

```text
1. SUBMIT
2. nếu đã ở Submit Received/PAY NOW -> không bấm SUBMIT lần nữa
```

---

## 18. Thứ tự ưu tiên locator của nút Next

File:

```text
src/bot/constants.ts
```

`NEXT_LOCATORS` được kiểm tra theo đúng thứ tự sau:

```text
1. [id$='nextImageButton']
2. [id$='NextButton']
3. input[value='Next']
4. //input[@value='Next']
5. //button[normalize-space()='Next']
6. input[alt='Next']
```

Bot chọn locator đầu tiên có element hiển thị và enabled.

### Nếu có Next

```text
findClickable(NEXT_LOCATORS)
clickControl(..., "NEXT")
```

### Nếu không có Next

Bot chuyển sang fallback theo thứ tự:

```text
1. SAVE
2. chờ tối đa 10 giây xem Next xuất hiện
3. nếu Next xuất hiện -> bấm Next
4. nếu URL đổi sau SAVE -> coi là đã chuyển
5. nếu không có Next/SAVE nhưng có SUBMIT -> bấm Submit
6. nếu không có nút nào -> lỗi
```

---

## 19. Thứ tự ưu tiên locator của nút Save

`SAVE_LOCATORS`:

```text
1. input[value='SAVE']
2. input.button-large-primary[value='SAVE']
3. input[id$='validateButton'][value='SAVE']
4. XPath input có value SAVE, không phân biệt hoa thường
5. button text SAVE
6. a text SAVE
```

Khi bấm SAVE:

```text
1. ghi INFO SAVE
2. click Selenium
3. fallback JavaScript click nếu click lỗi
4. chờ ASP.NET postback
5. chờ document ready
6. chờ captcha
7. ghi OK SAVE
```

---

## 20. Thứ tự ưu tiên locator của nút Submit

`SUBMIT_LOCATORS`:

```text
1. [id$='submitImageButton']
2. [id$='submitButton']
3. input[value='SUBMIT']
4. //input[@value='SUBMIT']
5. input có value SUBMIT, không phân biệt hoa thường
6. button text SUBMIT
```

Trước khi click Submit:

```text
1. kiểm tra response captcha
2. nếu thiếu -> chờ người dùng tick/giải captcha
3. tick declaration lại ở chế độ quiet nếu cần
4. click Submit
5. chờ staleness/URL/captcha/highload
6. kiểm tra có phải PAY NOW không
```

Nếu Submit timeout, bot đọc các selector validation:

```css
.ErrorMessageSmall
[id*='Error']
.validation-summary-errors
```

Sau đó lỗi sẽ chứa tối đa 8 validation message đầu tiên.

---

## 21. Bước 15: PAY NOW

Page name:

```text
pay_now
```

### Cách nhận diện

Bot nhận diện nếu:

- tìm thấy PAY LATER;
- URL chứa `submitreceived`;
- URL chứa `onlinesubmit`;
- URL `Submit.aspx` có token;
- body có `SUBMIT RECEIVED` và `PAY LATER`.

### Cách chọn PAY NOW

Bot dùng `findLabeled()` với:

```text
labels = ["PAY NOW"]
exclude = ["PAY LATER"]
```

Các node có thể kiểm tra:

```text
input
button
a
span
```

Blob dùng để so khớp gồm:

```text
value + textContent + id + title + alt
```

Bot loại element:

- hidden;
- display none;
- visibility hidden;
- kích thước 0;
- disabled.

### Thao tác

```text
1. chờ tìm thấy control PAY NOW
2. bấm PAY NOW
3. nếu click Selenium lỗi -> JavaScript click
4. chờ element stale hoặc PAY NOW biến mất
5. chờ document ready
6. chờ captcha
7. recover high load
8. ghi OK PAY_NOW
```

Log:

```text
[INFO] PAY_NOW — Từ <URL>
[OK] PAY_NOW — Sang <URL mới>
```

---

## 22. Bước 16: Payer Name

Page name:

```text
payer
```

### Giá trị ưu tiên

```text
1. applicant.payment.payer_name
2. applicant.payer_name
3. "Vu Quang Nguyen" fallback
```

### Locator ưu tiên

```text
1. payerNameTextBox
2. PayerNameTextBox
3. payerName
4. txtPayerName
5. cardHolderNameTextBox
6. nameOnCardTextBox
7. payerFullNameTextBox
```

Các locator đều được dùng theo dạng:

```css
[id$='<suffix>']
```

Field này được đánh dấu optional trong code hiện tại. Nếu không tìm thấy, `fillMany()` có thể bỏ qua.

Log thành công:

```text
[OK] FILL_PAYER — <payer name> 
```

Không ghi payer name thật vào tài liệu chia sẻ nếu đó là dữ liệu cá nhân.

---

## 23. Bước 17: nút OK

Sau payer name, bot trả action `payer_ok` rồi gọi `clickOk()`.

### Cách tìm OK

Bot tìm label `OK`, đồng thời loại:

```text
PAY NOW
PAY LATER
NEXT STEP
```

Nghĩa là element có text OK nhưng nằm trong blob chứa một trong các label bị loại sẽ không được chọn.

### Thao tác

```text
1. findLabeled(["OK"], ["PAY NOW", "PAY LATER", "NEXT STEP"])
2. click Selenium
3. fallback JavaScript click nếu cần
4. chờ stale/URL/goneWhen
5. chờ ready/captcha/highload
6. ghi OK
```

Nếu không tìm thấy:

```text
ERROR — OK button not found
```

---

## 24. Thứ tự ưu tiên nút Next Step / Secure Payment

Page name:

```text
pay_next
```

### Locator ưu tiên

`findPaymentGateway()` kiểm tra:

```text
1. #ContentPlaceHolder1_onlinePaymentAnchor2
2. a[id$='onlinePaymentAnchor2']
3. a[href*='PaymentGateway/OnLinePayment']
4. a[href*='OnLinePayment.aspx']
```

Nếu không tìm thấy, `isPayNextPage()` còn kiểm tra text:

```text
NEXT STEP
và một trong:
SECURE PAYMENT
TOTAL CHARGE
```

### Thao tác

```text
1. wait cho payment gateway link
2. tìm control theo locator ưu tiên
3. click control
4. nếu lỗi click -> JavaScript click
5. chờ stale
6. chờ ready
7. chờ captcha
8. recover high load
9. ghi OK NEXT_STEP
10. sang payment gateway
```

Log:

```text
[INFO] NEXT_STEP — Từ <URL>
[OK] NEXT_STEP — Sang <payment URL>
```

Đây là bước trước trang thanh toán thẻ.

---

## 25. Điểm dừng payment

Page name:

```text
payment
```

### Điều kiện nhận diện

Bot dừng nếu URL hoặc DOM cho thấy:

```text
URL chứa paystation
URL chứa paymark
URL chứa paymentexpress
URL chứa pxpay
input autocomplete="cc-number"
input id chứa cardNumber
input name chứa cardNumber
iframe payment gateway
```

### Hành động

```text
log OK STOP — Tới trang thanh toán thẻ. Không điền thẻ.
return stop
```

Bot không thực hiện:

- nhập card number;
- nhập expiry card;
- nhập CVV;
- bấm nút thanh toán cuối cùng.

---

## 26. Cơ chế điền text

File:

```text
src/bot/fill.ts
```

Pseudo-flow:

```text
for mỗi FillJob
    tìm element theo từng suffix theo thứ tự

    nếu không tìm thấy
        nếu optional -> log bỏ qua
        nếu bắt buộc -> throw Field not found

    nếu loại text
        nếu value hiện tại == value mong muốn
            result unchanged
        ngược lại
            set el.value
            dispatch input
            dispatch change
            nếu có jQuery -> trigger change

    ghi log FILL
```

Log ví dụ an toàn:

```text
[INFO] FILL — familyNameTextBox = <configured value> (ghi)
[INFO] FILL — givenName2Textbox (bỏ qua, không bắt buộc)
[INFO] FILL — emailAddressTextBox = <configured value> (đã đúng)
```

---

## 27. Cơ chế điền select

```text
1. lấy wanted từ applicant.json
2. trim wanted
3. tìm option có text trim == wanted
4. nếu không có, tìm option có value == wanted
5. nếu vẫn không có -> lỗi và in danh sách option
6. nếu select đã đúng -> unchanged
7. nếu chưa đúng -> set value
8. trigger jQuery/Select2 hoặc change event
9. nếu field có postback -> chờ postback xong
```

Lỗi điển hình:

```text
Could not select '<wanted>' on <element id>: <options>
```

Khi gặp lỗi này cần so sánh chính xác:

```text
giá trị applicant.json
vs
text/value thật của <option>
```

---

## 28. Chờ sau mỗi nút

Mọi click chuyển trang dùng một hoặc cả các điều kiện sau:

```text
1. element trở nên stale
2. document.readyState là interactive/complete
3. URL thay đổi
4. captcha xuất hiện
5. high load xuất hiện
6. điều kiện riêng của nút đạt
```

Nếu URL không đổi ngay, không luôn có nghĩa click thất bại. Một số thao tác dùng ASP.NET postback hoặc cập nhật DOM tại chỗ.

### `clickControl()`

Dùng cho:

```text
NEXT
SUBMIT
```

Timeout sẽ đọc validation message và ném lỗi.

### `clickFound()`

Dùng cho:

```text
PAY_NOW
NEXT_STEP
OK
PAY_LATER
```

Nếu URL không đổi nhưng element biến mất hoặc điều kiện `goneWhen` đạt, thao tác vẫn được coi là thành công.

---

## 29. High load và retry

Page name:

```text
highload
```

Khi gặp high load, log dạng:

```text
[PAUSE] HIGH_LOAD — INZ quá tải. F5 ngay...
```

Hoặc:

```text
[PAUSE] HIGH_LOAD — INZ quá tải. Đợi <n>s rồi F5...
```

Thứ tự recovery:

```text
1. kiểm tra quota
2. tăng số lần retry
3. tính delay backoff
4. refresh trang
5. nếu refresh lỗi -> location.reload()
6. nếu vẫn lỗi -> driver.get(url cũ)
7. waitReady
8. pauseForCaptcha
9. nếu quay về login -> login lại
10. tiếp tục wizard
```

Nếu high load xảy ra trong hồ sơ có `ApplicationId`, delay tối đa khoảng 3 giây. Ngoài hồ sơ, delay tối đa khoảng 5 giây.

---

## 30. Session hết hạn

Nếu `detectPage()` trả `login` trong lúc wizard đang chạy:

```text
1. log RESUME
2. load lại username/password
3. login()
4. continueToApplication()
5. mở hồ sơ Incomplete
6. không APPLY NOW lại
7. quay lại vòng wizard
```

Log cần tìm:

```text
[INFO] RESUME — Session hết hạn — login lại rồi mở hồ sơ Incomplete (không APPLY NOW)
```

---

## 31. Chống vòng lặp

Bot lưu số lần URL đã xuất hiện trong `Map`.

```text
nếu URL đã xuất hiện >= 2 lần
và lần này không vừa recovery high load
    log STOP — URL lặp lại, dừng để tránh vòng lặp
    return
```

Khi thấy log này:

1. xem 2 dòng `PAGE` trước đó;
2. xem nút gần nhất là NEXT/SAVE/SUBMIT nào;
3. xem validation hoặc captcha có giữ trang không;
4. kiểm tra URL có thay đổi query/token không;
5. không tự tăng số lần lặp trước khi hiểu nguyên nhân.

---

## 32. Bảng log cần đối chiếu theo thứ tự

| Log mong đợi | Ý nghĩa |
|---|---|
| `START` | Process bắt đầu |
| `LOGIN Mở` | Đã gọi mở login URL |
| `LOGIN Bấm LOGIN` | Đã bấm login |
| `LOGIN OK` | Login thành công |
| `WIZARD` hoặc `OPEN_EXISTING` | Đã vào hồ sơ |
| `SELECT_COUNTRY` | Đang chọn country |
| `APPLY_NOW` | Đã bắt đầu application |
| `PAGE` | Đã nhận diện trang hiện tại |
| `FILL_*` | Đã điền xong nhóm field |
| `FILL` | Chi tiết từng field |
| `NEXT` | Đang bấm/chờ Next |
| `SAVE` | Đã dùng fallback Save |
| `SUBMIT` | Đã xử lý Submit |
| `PAY_NOW` | Đã bấm Pay Now |
| `FILL_PAYER` | Đã điền tên payer |
| `OK` | Đã xác nhận payer/payment step |
| `NEXT_STEP` | Đã đi tới payment gateway |
| `STOP` | Bot chủ động dừng |
| `CAPTCHA` | Đang chờ hoặc đã qua captcha |
| `HIGH_LOAD` | Đang recovery quá tải |
| `FAIL` | Phiên gặp lỗi không xử lý được |
| `SUMMARY` | Tổng kết thời gian |
| `TELEGRAM` | Kết quả gửi Telegram |

---

## 33. Bảng lỗi theo vị trí dừng

### Dừng trước LOGIN

Kiểm tra:

- process có chạy không;
- ChromeDriver có tạo được Chrome không;
- profile Chrome có bị khóa không;
- `.env` có được load không.

### Dừng sau `LOGIN Bấm LOGIN`

Kiểm tra:

- `authenticationErrorLabel`;
- username/password;
- tài khoản bị khóa;
- captcha sau login;
- URL redirect.

### Dừng ở `PAGE` nhưng không có `FILL_*`

Kiểm tra:

- page name nhận diện đúng chưa;
- selector field có đổi không;
- `UNKNOWN_<PAGE>` có xuất hiện không.

### Dừng khi `FILL`

Kiểm tra:

- field bắt buộc có tồn tại không;
- suffix locator có đúng không;
- select có option đúng text/value không;
- postback có hoàn tất chưa.

### Dừng ở `NEXT`

Kiểm tra theo thứ tự:

```text
1. Next có tồn tại không?
2. Nếu không, Save có tồn tại không?
3. Sau Save có Next xuất hiện không?
4. Có lỗi validation không?
5. Có captcha/high load không?
```

### Dừng ở `SUBMIT`

Kiểm tra:

- declaration checkbox đã tick chưa;
- response captcha đã có chưa;
- validation message;
- trang đã chuyển sang Submit Received chưa.

### Dừng ở `PAY_NOW`, `OK`, `NEXT_STEP`

Kiểm tra:

- button/link có hidden không;
- text có bị đổi không;
- URL payment có mở trong tab/window khác không;
- payment gateway locator có đổi không.

### Dừng ở `UNKNOWN_*`

Lấy danh sách field trong log, chụp DOM/screenshot, sau đó bổ sung mapping trước khi chạy lại.

---

## 34. Pseudocode quan sát một vòng wizard

```text
repeat tối đa 14 lần:

    nếu trang high load:
        ghi HIGH_LOAD
        refresh và chờ
        nếu quay về login:
            login lại và mở Incomplete
        tiếp tục vòng lặp

    page = detectPage()
    url = currentUrl()
    ghi PAGE(page, url)

    nếu page == login:
        resumeSession()
        continue

    nếu URL lặp >= 2 lần:
        ghi STOP
        dừng

    nếu page == personal1:
        điền Personal1 theo bảng
        action = continue

    nếu page == personal2:
        điền Identification theo bảng
        action = continue

    nếu page == health:
        điền Health theo bảng
        action = continue

    nếu page == character:
        điền Character theo bảng
        action = continue

    nếu page == whs:
        điền WHS theo bảng
        action = continue

    nếu page == personal3:
        dump field
        action = continue

    nếu page == declaration:
        tick declaration
        action = submit

    nếu page == pay_now:
        action = pay_now

    nếu page == payer:
        điền payer name
        action = payer_ok

    nếu page == pay_next:
        action = pay_next

    nếu page == payment:
        ghi STOP không điền thẻ
        dừng

    nếu page == unknown:
        dump field
        ghi STOP
        dừng

    nếu action == submit:
        xử lý captcha trước Submit
        bấm SUBMIT
        tiếp tục

    nếu action == pay_now:
        bấm PAY NOW
        tiếp tục

    nếu action == payer_ok:
        bấm OK
        tiếp tục

    nếu action == pay_next:
        bấm NEXT STEP
        tiếp tục

    nếu action == continue:
        bấm NEXT theo thứ tự ưu tiên
        nếu không có Next -> SAVE -> Next -> Submit
```

---

## 35. Checklist quan sát thực tế

### Trước khi bấm chạy

- [ ] `applicant.json` có đủ nhóm personal/address/contact.
- [ ] identification có passport và ngày tháng.
- [ ] health/character/whs có giá trị đúng với option trên website.
- [ ] `.env` có credentials nhưng không commit.
- [ ] Chrome/profile đúng và không bị process khác khóa.
- [ ] Telegram không bắt buộc cho Selenium core.
- [ ] Chrome đang mở đúng trang hoặc bot có thể tự mở login.

### Trong lúc login

- [ ] Có log `START`.
- [ ] Có log `LOGIN Mở`.
- [ ] Nếu captcha: thấy `CAPTCHA_INFO` và `CAPTCHA`.
- [ ] Có log `LOGIN Bấm LOGIN`.
- [ ] Có log `LOGIN OK` hoặc lỗi rõ ràng.

### Trong lúc điền form

- [ ] Mỗi page có một dòng `PAGE`.
- [ ] Mỗi nhóm có `FILL_PERSONAL1`, `FILL_IDENTIFICATION`, `FILL_HEALTH`, `FILL_CHARACTER`, `FILL_WHS`.
- [ ] Field bắt buộc không có `Field not found`.
- [ ] Select không có `Could not select`.
- [ ] Sau select có postback thì bot chờ trước khi điền tiếp.

### Trong lúc chuyển trang

- [ ] Ưu tiên Next.
- [ ] Nếu không có Next thì quan sát Save.
- [ ] Nếu không có Next/Save thì mới dùng Submit.
- [ ] Sau mỗi click có log chờ/chuyển trang.
- [ ] Nếu validation lỗi, dừng để sửa dữ liệu thay vì click lặp.

### Trước payment

- [ ] Có `SUBMIT` thành công.
- [ ] Có `PAY_NOW`.
- [ ] Có `FILL_PAYER`.
- [ ] Có `OK`.
- [ ] Có `NEXT_STEP`.
- [ ] Khi tới card gateway, log `STOP`.
- [ ] Không nhập số thẻ/CVV tự động.

---

## 36. Tóm tắt thứ tự ưu tiên nút

```text
Ở form thông thường:
    1. NEXT
    2. nếu không có NEXT -> SAVE
    3. sau SAVE nếu có NEXT -> NEXT
    4. nếu không có NEXT/SAVE và có SUBMIT -> SUBMIT
    5. nếu không có gì -> lỗi

Ở declaration:
    1. tick checkbox
    2. xử lý captcha
    3. SUBMIT

Ở trang Submit Received:
    1. PAY NOW

Ở trang payer:
    1. điền payer name
    2. OK

Ở trang payment selection:
    1. NEXT STEP / Secure Payment

Ở card gateway:
    1. STOP
    2. không điền thẻ
```

---

## 37. File source dùng để đối chiếu

- [login.ts](../src/bot/login.ts): entrypoint.
- [driver.ts](../src/bot/driver.ts): WebDriver và wait.
- [auth.ts](../src/bot/auth.ts): login.
- [entry.ts](../src/bot/entry.ts): vào hồ sơ.
- [wizard.ts](../src/bot/wizard.ts): vòng lặp wizard.
- [page.ts](../src/bot/page.ts): detect page.
- [forms.ts](../src/bot/forms.ts): mapping field.
- [fill.ts](../src/bot/fill.ts): set text/select/postback.
- [clicks.ts](../src/bot/clicks.ts): click và thứ tự nút.
- [elements.ts](../src/bot/elements.ts): locator helper.
- [captcha.ts](../src/bot/captcha.ts): captcha.
- [recover.ts](../src/bot/recover.ts): high load/session.
- [declaration.ts](../src/bot/declaration.ts): declaration checkbox.
- [logger.ts](../src/bot/logger.ts): log và status.
- [applicant.ts](../src/bot/applicant.ts): input data.
- [constants.ts](../src/bot/constants.ts): locator constants.
