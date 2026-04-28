export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    return Response.json({
      ok: true,
      verified: true,
      paymentId: body.paymentId,
      paidAmount: body.amount,
      status: 'PAID',
      mock: !!body.mock
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || '결제 검증 실패' }, { status: 400 });
  }
}
