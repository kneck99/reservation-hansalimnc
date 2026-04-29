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

function buildPaymentId(prefix = "HS") {
  const stamp = Date.now();
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `${prefix}-${stamp}-${rand}`;
}

async function getPortOnePayment(env, paymentId) {
  const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: {
      "Authorization": `PortOne ${env.PORTONE_API_SECRET}`,
      "Content-Type": "application/json"
    }
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(data.message || "포트원 결제 조회 실패");
  }

  return data;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // 1) 연수원 예상 결제금액 자동 계산
    if (url.pathname === "/api/quote" && request.method === "POST") {
      try {
        const body = await request.json();
        const bookingType = body.bookingType || "dorm";
        const totalAmount = bookingType === "dorm"
          ? calculateDormPrice(body.headcount)
          : 0;

        return json({
          ok: true,
          bookingType,
          totalAmount
        });
      } catch (error) {
        return json({
          ok: false,
          error: error.message || "금액 계산 실패"
        }, 400);
      }
    }

    // 2) 예약/결제 사전 생성
    if (url.pathname === "/api/create-payment" && request.method === "POST") {
      try {
        const body = await request.json();
        const bookingType = body.bookingType || "meeting";

        if (!body.startDate || !body.endDate) {
          throw new Error("날짜를 입력해 주세요.");
        }
        if (!body.contactName) {
          throw new Error("담당자명을 입력해 주세요.");
        }
        if (!body.phone) {
          throw new Error("연락처를 입력해 주세요.");
        }
        if (!body.email) {
          throw new Error("이메일을 입력해 주세요.");
        }
        if (!body.purpose) {
          throw new Error("이용 목적을 입력해 주세요.");
        }

        const totalAmount = bookingType === "dorm"
          ? calculateDormPrice(body.headcount)
          : 0;

        const paymentId = buildPaymentId(bookingType === "dorm" ? "DORM" : "MEETING");

        const reservation = {
          bookingType,
          resourceName: body.resourceName || (bookingType === "dorm" ? "연수원" : ""),
          startDate: body.startDate,
          endDate: body.endDate,
          headcount: Number(body.headcount || 0),
          contactName: body.contactName,
          phone: body.phone,
          email: body.email,
          purpose: body.purpose,
          settlementMethod: body.settlementMethod || "",
          totalAmount
        };

        return json({
          ok: true,
          paymentId,
          paymentRequired: bookingType === "dorm",
          orderName: bookingType === "dorm"
            ? "한살림 농업살림센터 연수원 예약"
            : "한살림 농업살림센터 회의실 예약",
          totalAmount,
          reservation
        });
      } catch (error) {
        return json({
          ok: false,
          error: error.message || "예약 데이터 생성 실패"
        }, 400);
      }
    }

    // 3) 기존 mock 검증 (개발 중 임시 유지 가능)
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
        return json({
          ok: false,
          error: error.message || "결제 검증 실패"
        }, 400);
      }
    }

    // 4) 실제 PortOne 서버 검증
    if (url.pathname === "/api/payment/complete" && request.method === "POST") {
      try {
        const body = await request.json();
        const paymentId = body.paymentId;
        const order = body.order || {};

        if (!env.PORTONE_API_SECRET) {
          throw new Error("PORTONE_API_SECRET 환경변수가 없습니다.");
        }

        const payment = await getPortOnePayment(env, paymentId);
        const paymentData = payment.payment || payment;

        const status = paymentData.status;
        const paidTotal =
          paymentData.amount?.total ??
          paymentData.totalAmount ??
          0;

        const expectedTotal = calculateDormPrice(order.headcount);

        if (status !== "PAID") {
          throw new Error(`결제 상태가 PAID가 아닙니다: ${status}`);
        }

        if (Number(paidTotal) !== Number(expectedTotal)) {
          throw new Error(`결제 금액 불일치: ${paidTotal} / ${expectedTotal}`);
        }

        return json({
          ok: true,
          verified: true,
          paymentId,
          status,
          paidAmount: paidTotal
        });
      } catch (error) {
        return json({
          ok: false,
          error: error.message || "실결제 검증 실패"
        }, 400);
      }
    }

    // 5) 예약 완료 처리
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
          reservationNo: data.reservationNo || data.booking?.reservationNo || "",
          reservation: data.reservation || body.reservation,
          appsScript: data
        });
      } catch (error) {
        return json({
          ok: false,
          error: error.message || "예약 완료 처리 실패"
        }, 500);
      }
    }

    return json({ ok: false, error: "Not found" }, 404);
  }
};
