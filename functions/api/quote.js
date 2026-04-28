function calculateDormPrice(headcount) {
  const count = Number(headcount || 0);
  if (!count || count < 1) throw new Error('인원 수를 1명 이상 입력해 주세요.');
  if (count <= 8) return 150000;
  return 150000 + ((count - 8) * 20000);
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const bookingType = body.bookingType || 'dorm';
    const totalAmount = bookingType === 'dorm' ? calculateDormPrice(body.headcount) : 0;
    return Response.json({ ok: true, bookingType, totalAmount });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || '금액 계산 실패' }, { status: 400 });
  }
}
