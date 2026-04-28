export async function onRequestPost(context) {
  try {
    const env = context.env;
    const body = await context.request.json();
    if (!env.APPS_SCRIPT_URL) throw new Error('APPS_SCRIPT_URL 환경변수가 없습니다.');
    const upstream = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'completeBooking',
        paymentId: body.paymentId,
        reservation: body.reservation,
        verification: body.verification
      })
    });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return Response.json({ ok: true, appsScript: data });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || '예약 완료 처리 실패' }, { status: 500 });
  }
}
