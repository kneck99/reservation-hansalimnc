export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    return Response.json({ ok: true, received: true, event: body });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || '웹훅 처리 실패' }, { status: 400 });
  }
}
