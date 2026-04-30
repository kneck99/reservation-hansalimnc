const ALLOWED_ORIGIN = "https://reservation.hansalimnc.co.kr";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

const textEncoder = new TextEncoder();

function isoNow() {
  return new Date().toISOString();
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function normalizeLoginId(value) {
  return String(value || '').trim().toLowerCase();
}

function clean(value) {
  return String(value || '').trim();
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

async function sha256Hex(input) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(loginId, password, env) {
  const normalizedId = normalizeLoginId(loginId);
  const raw = `${env.SESSION_SECRET}::${normalizedId}::${String(password || '')}`;
  return await sha256Hex(raw);
}

function makeSessionToken() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function getSessionUser(env, token) {
  if (!token) return null;

  const row = await env.DB.prepare(`
    SELECT
      s.id AS session_id,
      s.user_id,
      s.expires_at,
      u.login_id,
      u.name,
      u.phone,
      u.affiliation,
      u.role,
      u.status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
    LIMIT 1
  `).bind(token).first();

  if (!row) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(token).run();
    return null;
  }

  return row;
}

async function requireAuth(request, env) {
  const token = getBearerToken(request);
  const user = await getSessionUser(env, token);

  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  if (user.status !== 'approved') {
    throw new Error('승인된 계정만 사용할 수 있습니다.');
  }

  return user;
}

async function requireAdmin(request, env) {
  const user = await requireAuth(request, env);

  if (user.role !== 'admin') {
    throw new Error('관리자 권한이 필요합니다.');
  }

  return user;
}

async function createSession(env, userId) {
  const token = makeSessionToken();
  const now = isoNow();
  const expiresAt = addDays(7);

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(token, userId, expiresAt, now).run();

  return {
    token,
    expiresAt
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
   
    // 회원가입
    if (url.pathname === "/api/auth/signup" && request.method === "POST") {
      try {
        const body = await request.json();

        const loginId = normalizeLoginId(body.loginId);
        const password = String(body.password || '');
        const name = clean(body.name);
        const phone = normalizePhone(body.phone);
        const affiliation = clean(body.affiliation);

        if (!loginId) throw new Error("아이디를 입력해 주세요.");
        if (!password || password.length < 4) throw new Error("비밀번호를 4자 이상 입력해 주세요.");
        if (!name) throw new Error("이름을 입력해 주세요.");
        if (!phone) throw new Error("전화번호를 입력해 주세요.");
        if (!affiliation) throw new Error("소속을 입력해 주세요.");

        const exists = await env.DB.prepare(`
          SELECT id FROM users WHERE login_id = ? LIMIT 1
        `).bind(loginId).first();

        if (exists) {
          throw new Error("이미 사용 중인 아이디입니다.");
        }

        const passwordHash = await hashPassword(loginId, password, env);
        const now = isoNow();

        await env.DB.prepare(`
          INSERT INTO users (
            login_id, password_hash, name, phone, affiliation, role, status, created_at
          ) VALUES (?, ?, ?, ?, ?, 'user', 'pending', ?)
        `).bind(loginId, passwordHash, name, phone, affiliation, now).run();

        return json({
          ok: true,
          message: "회원가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다."
        });
      } catch (error) {
        return json({ ok: false, error: error.message || "회원가입 실패" }, 400);
      }
    }

    // 로그인
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        const body = await request.json();

        const loginId = normalizeLoginId(body.loginId);
        const password = String(body.password || '');

        if (!loginId) throw new Error("아이디를 입력해 주세요.");
        if (!password) throw new Error("비밀번호를 입력해 주세요.");

        const user = await env.DB.prepare(`
          SELECT * FROM users WHERE login_id = ? LIMIT 1
        `).bind(loginId).first();

        if (!user) {
          throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
        }

        const passwordHash = await hashPassword(loginId, password, env);
        if (user.password_hash !== passwordHash) {
          throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
        }

        if (user.status !== 'approved') {
          throw new Error("아직 승인되지 않은 계정입니다.");
        }

        const session = await createSession(env, user.id);

        await env.DB.prepare(`
          UPDATE users SET last_login_at = ? WHERE id = ?
        `).bind(isoNow(), user.id).run();

        return json({
          ok: true,
          token: session.token,
          expiresAt: session.expiresAt,
          user: {
            id: user.id,
            loginId: user.login_id,
            name: user.name,
            phone: user.phone,
            affiliation: user.affiliation,
            role: user.role,
            status: user.status
          }
        });
      } catch (error) {
        return json({ ok: false, error: error.message || "로그인 실패" }, 400);
      }
    }

    // 내 정보
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      try {
        const user = await requireAuth(request, env);

        return json({
          ok: true,
          user: {
            id: user.user_id,
            loginId: user.login_id,
            name: user.name,
            phone: user.phone,
            affiliation: user.affiliation,
            role: user.role,
            status: user.status
          }
        });
      } catch (error) {
        return json({ ok: false, error: error.message || "인증 확인 실패" }, 401);
      }
    }

    // 로그아웃
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      try {
        const token = getBearerToken(request);
        if (token) {
          await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(token).run();
        }

        return json({
          ok: true,
          message: "로그아웃 되었습니다."
        });
      } catch (error) {
        return json({ ok: false, error: error.message || "로그아웃 실패" }, 400);
      }
    }

    // 최초 관리자 지정
    if (url.pathname === "/api/admin/bootstrap" && request.method === "POST") {
      try {
        const body = await request.json();
        const initAdminKey = String(body.initAdminKey || '');
        const loginId = normalizeLoginId(body.loginId);

        if (!env.INIT_ADMIN_KEY) {
          throw new Error("INIT_ADMIN_KEY 환경변수가 없습니다.");
        }

        if (initAdminKey !== env.INIT_ADMIN_KEY) {
          throw new Error("초기 관리자 키가 올바르지 않습니다.");
        }

        if (!loginId) {
          throw new Error("관리자로 지정할 아이디를 입력해 주세요.");
        }

        const user = await env.DB.prepare(`
          SELECT id FROM users WHERE login_id = ? LIMIT 1
        `).bind(loginId).first();

        if (!user) {
          throw new Error("해당 아이디의 사용자가 없습니다.");
        }

        await env.DB.prepare(`
          UPDATE users
          SET status = 'approved', role = 'admin'
          WHERE login_id = ?
        `).bind(loginId).run();

        return json({
          ok: true,
          message: "초기 관리자 지정이 완료되었습니다."
        });
      } catch (error) {
        return json({ ok: false, error: error.message || "초기 관리자 지정 실패" }, 400);
      }
    }

    // 승인 대기 사용자 목록
    if (url.pathname === "/api/admin/users" && request.method === "GET") {
      try {
        await requireAdmin(request, env);

        const status = clean(url.searchParams.get('status') || 'pending');

        const result = await env.DB.prepare(`
          SELECT id, login_id, name, phone, affiliation, role, status, created_at
          FROM users
          WHERE status = ?
          ORDER BY id ASC
        `).bind(status).all();

        return json({
          ok: true,
          users: result.results || []
        });
      } catch (error) {
        return json({ ok: false, error: error.message || "사용자 목록 조회 실패" }, 403);
      }
    }

    // 사용자 승인
    if (url.pathname === "/api/admin/users/approve" && request.method === "POST") {
      try {
        await requireAdmin(request, env);

        const body = await request.json();
        const userId = Number(body.userId);

        if (!userId) {
          throw new Error("userId가 필요합니다.");
        }

        await env.DB.prepare(`
          UPDATE users
          SET status = 'approved'
          WHERE id = ?
        `).bind(userId).run();

        return json({
          ok: true,
          message: "사용자 승인이 완료되었습니다."
        });
      } catch (error) {
        return json({ ok: false, error: error.message || "사용자 승인 실패" }, 400);
      }
    }

    // 사용자 반려
    if (url.pathname === "/api/admin/users/reject" && request.method === "POST") {
      try {
        await requireAdmin(request, env);

        const body = await request.json();
        const userId = Number(body.userId);

        if (!userId) {
          throw new Error("userId가 필요합니다.");
        }

        await env.DB.prepare(`
          UPDATE users
          SET status = 'rejected'
          WHERE id = ?
        `).bind(userId).run();

        return json({
          ok: true,
          message: "사용자 반려가 완료되었습니다."
        });
      } catch (error) {
        return json({ ok: false, error: error.message || "사용자 반려 실패" }, 400);
      }
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
