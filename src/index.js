const ALLOWED_ORIGIN = "https://reservation.hansalimnc.co.kr";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function calculateDormPrice(headcount) {
  const count = Number(headcount || 0);
  if (!count || count < 1) {
    throw new Error("인원 수를 1명 이상 입력해 주세요.");
  }
  if (count <= 8) return 150000;
  return 150000 + ((count - 8) * 20000);
}

function buildPaymentId() {
  const stamp = Date.now();
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `HS-${stamp}-${rand}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // 금액 계산
    if (url.pathname === "/api/quote" && request.method === "POST") {
      try {
        const body = await request.json();
        const bookingType = body.bookingType || "dorm";
        const totalAmount =
          bookingType === "dorm" ? calculateDormPrice(body.headcount) : 0;

        return json({
          ok: true,
          bookingType,
          totalAmount
        });
      } catch (error) {
        return json(
          { ok: false, error: error.message || "금액 계산 실패" },
          400
        );
      }
    }

    // 예약 검증
    if (url.pathname === "/api/create-payment" && request.method === "POST") {
      try {
        const body = await request.json();

        if (!body.startDate || !body.endDate) throw new Error("날짜를 입력해 주세요.");
        if (!body.contactName) throw new Error("담당자명을 입력해 주세요.");
        if (!body.phone) throw new Error("연락처를 입력해 주세요.");
        if (!body.email) throw new Error("이메일을 입력해 주세요.");
        if (!body.purpose) throw new Error("이용 목적을 입력해 주세요.");

        const totalAmount =
          (body.bookingType || "dorm") === "dorm"
            ? calculateDormPrice(body.headcount)
            : 0;

        return json({
          ok: true,
          paymentId: buildPaymentId(),
          totalAmount,
          reservation: {
            bookingType: body.bookingType || "dorm",
            resourceName: body.resourceName || "연수원",
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
        return json(
          { ok: false, error: error.message || "예약 검증 실패" },
          400
        );
      }
    }

    // 결제 검증(개발용 목 응답)
    if (url.pathname === "/api/verify-payment" && request.method === "POST") {
      try {
        const body = await request.json();
        return json({
          ok: true,
          verified: true,
          paymentId: body.paymentId,
          paidAmount: body.amount,
          status: "PAID",
          mock: !!body.mock
        });
      } catch (error) {
        return json(
          { ok: false, error: error.message || "결제 검증 실패" },
          400
        );
      }
    }

    // Apps Script로 최종 예약 전달
    if (url.pathname === "/api/booking-complete" && request.method === "POST") {
      try {
        const body = await request.json();

        if (!env.APPS_SCRIPT_URL) {
          throw new Error("APPS_SCRIPT_URL 환경변수가 없습니다.");
        }

        const upstream = await fetch(env.APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "completeBooking",
            paymentId: body.paymentId,
            reservation: body.reservation,
            verification: body.verification
          })
        });

        const text = await upstream.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }

        return json({
          ok: true,
          appsScript: data
        });
      } catch (error) {
        return json(
          { ok: false, error: error.message || "예약 완료 처리 실패" },
          500
        );
      }
    }

    // 정적 파일 fallback
    return env.ASSETS.fetch(request);
  }
};
