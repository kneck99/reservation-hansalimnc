(function () {
  const cfg = window.HS_CONFIG || {};
  const $ = (sel, root=document) => root.querySelector(sel);

  const logBox = $('#log');
  const amountEl = $('#quotedAmount');
  const btnQuote = $('#btnQuote');
  const btnPrepare = $('#btnPrepare');
  const btnPay = $('#btnPay');

  let preparedPayment = null;

  function log(message, data) {
    const line = typeof data === 'undefined'
      ? `[${new Date().toLocaleTimeString()}] ${message}`
      : `[${new Date().toLocaleTimeString()}] ${message}\n${JSON.stringify(data, null, 2)}`;
    logBox.textContent = line + "\n\n" + logBox.textContent;
  }

  function collectForm() {
    return {
      bookingType: $('#bookingType').value,
      resourceName: $('#resourceName').value,
      startDate: $('#startDate').value,
      endDate: $('#endDate').value,
      headcount: Number($('#headcount').value || 0),
      contactName: $('#contactName').value.trim(),
      phone: $('#phone').value.trim(),
      email: $('#email').value.trim(),
      purpose: $('#purpose').value.trim(),
      agree: $('#agree').checked
    };
  }

  async function postJSON(path, body) {
    const base = (cfg.apiBaseUrl || '').replace(/\/$/, '');
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  async function quote() {
    const payload = collectForm();
    const data = await postJSON('/api/quote', payload);
    amountEl.textContent = `${Number(data.totalAmount).toLocaleString('ko-KR')}원`;
    log('금액 계산 완료', data);
    return data;
  }

  async function preparePayment() {
    const payload = collectForm();
    if (!payload.startDate || !payload.endDate) throw new Error('날짜를 입력해 주세요.');
    if (!payload.contactName) throw new Error('담당자명을 입력해 주세요.');
    if (!payload.phone) throw new Error('연락처를 입력해 주세요.');
    if (!payload.email) throw new Error('이메일을 입력해 주세요.');
    if (!payload.purpose) throw new Error('이용 목적을 입력해 주세요.');
    const data = await postJSON('/api/create-payment', payload);
    preparedPayment = data;
    amountEl.textContent = `${Number(data.totalAmount).toLocaleString('ko-KR')}원`;
    log('예약 검증 완료', data);
    return data;
  }

  async function mockPayAndComplete() {
    const payment = preparedPayment || await preparePayment();
    const verifyResult = await postJSON('/api/verify-payment', {
      paymentId: payment.paymentId,
      amount: payment.totalAmount,
      mock: true
    });
    log('결제 검증 완료', verifyResult);

    const completeResult = await postJSON('/api/booking-complete', {
      paymentId: payment.paymentId,
      reservation: payment.reservation,
      verification: verifyResult
    });
    log('예약 완료 처리', completeResult);
    location.href = '/success.html';
  }

  btnQuote?.addEventListener('click', async () => {
    try {
      await quote();
    } catch (err) {
      log(`금액 계산 실패: ${err.message}`);
      alert(err.message);
    }
  });

  btnPrepare?.addEventListener('click', async () => {
    try {
      await preparePayment();
      alert('예약 검증이 완료되었습니다. 이제 결제를 진행할 수 있습니다.');
    } catch (err) {
      log(`예약 검증 실패: ${err.message}`);
      alert(err.message);
    }
  });

  btnPay?.addEventListener('click', async () => {
    try {
      if (!collectForm().agree) throw new Error('이용약관 및 취소/환불정책 확인이 필요합니다.');
      await mockPayAndComplete();
    } catch (err) {
      log(`결제/예약 완료 실패: ${err.message}`);
      alert(err.message);
      location.href = '/fail.html';
    }
  });

  btnQuote?.click();
})();
