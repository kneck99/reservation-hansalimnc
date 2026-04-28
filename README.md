# 한살림 농업살림센터 예약 스타터

이 프로젝트는 아래 구조를 기준으로 만든 시작용 템플릿입니다.

- 프론트: Cloudflare Pages
- API: Cloudflare Pages Functions
- 내부 자동화: Google Apps Script
- 결제: PortOne

## 폴더 구조

- `index.html`: 예약 입력 화면
- `assets/config.example.js`: 브라우저용 공개 설정 예시
- `assets/app.js`: 예약 폼 동작
- `functions/api/quote.js`: 금액 계산
- `functions/api/create-payment.js`: 예약 검증
- `functions/api/verify-payment.js`: 결제 검증
- `functions/api/booking-complete.js`: Apps Script 호출
- `functions/api/portone-webhook.js`: PortOne 웹훅

## 1. GitHub 저장소 만들기

새 저장소를 만들고 이 파일들을 업로드합니다.

## 2. Cloudflare Pages 연결

- Workers & Pages
- Create application
- Pages
- Connect to Git
- 방금 만든 저장소 선택

## 3. 커스텀 도메인 연결

Cloudflare Pages 프로젝트에서 먼저 `reservation.hansalimnc.co.kr`를 추가한 뒤,
HOSTING.KR DNS에서 아래처럼 CNAME을 추가합니다.

- 타입: CNAME
- 이름: reservation
- 값: `<your-project>.pages.dev`

## 4. 환경변수 설정

Cloudflare Pages 프로젝트 > Settings > Variables and Secrets

필수:
- `APPS_SCRIPT_URL`

권장:
- `PORTONE_API_SECRET`
- `PORTONE_STORE_ID`
- `PORTONE_CHANNEL_KEY`

## 5. Apps Script

`apps_script/Code.gs` 예시를 참고해 웹앱을 배포합니다.
실제 운영에서는 예약 저장, 캘린더 등록, 메일 발송 로직을 이쪽에 넣습니다.

## 6. PortOne 실연동

현재 `assets/app.js`는 개발용으로 목 결제 흐름만 연결되어 있습니다.
실운영에서는 PortOne 브라우저 SDK 호출 + `/api/verify-payment` 서버 검증으로 바꾸세요.
