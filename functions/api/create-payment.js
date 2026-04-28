function calculateDormPrice(headcount) {
  const count = Number(headcount || 0);
  if (!count || count < 1) throw new Error('인원 수를 1명 이상 입력해 주세요.');
  if (count <= 8) return 150000;
  return 150000 + ((count - 8) * 20000);
}
function buildPaymentId() {
  const stamp = Date.now();
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `HS-${stamp}-${rand}`;
}
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    if (!body.startDate || !body.endDate) throw new Error('날짜를 입력해 주세요.');
    if (!body.contactName) throw new Error('담당자명을 입력해 주세요.');
    if (!body.phone) throw new Error('연락처를 입력해 주세요.');
    if (!body.email) throw new Error('이메일을 입력해 주세요.');
    if (!body.purpose) throw new Error('이용 목적을 입력해 주세요.');
    const totalAmount = (body.bookingType || 'dorm') === 'dorm' ? calculateDormPrice(body.headcount) : 0;
    const paymentId = buildPaymentId();
    return Response.json({
      ok: true,
      paymentId,
      totalAmount,
      reservation: {
        bookingType: body.bookingType || 'dorm',
        resourceName: body.resourceName || '연수원',
        startDate: body.startDate,
        endDate: body.endDate,
        headcount: Number(body.headcount || 0),
        contactName: body.contactName,
        phone: body.phone,
        email: body.email,
        purpose: body.purpose
      }
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || '예약 검증 실패' }, { status: 400 });
  }
}
