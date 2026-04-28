function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents || '{}');
    var action = payload.action || '';

    if (action === 'completeBooking') {
      return handleCompleteBooking_(payload);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: '지원하지 않는 action 입니다.' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleCompleteBooking_(payload) {
  var reservation = payload.reservation || {};
  var verification = payload.verification || {};

  // TODO:
  // 1) 예약번호 생성
  // 2) 시트에 appendRow
  // 3) 구글 캘린더 일정 생성
  // 4) 예약 안내 메일 전송

  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      saved: true,
      reservation: reservation,
      verification: verification
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
