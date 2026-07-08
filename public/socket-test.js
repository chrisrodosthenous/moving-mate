(function () {
  const logEl = document.getElementById('log');
  const tokenInput = document.getElementById('token');
  const userIdInput = document.getElementById('userId');
  let socket = null;

  function log(line) {
    const t = new Date().toISOString().slice(11, 23);
    logEl.textContent += `[${t}] ${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function tryFillUserIdFromJwt() {
    const raw = String(tokenInput.value || '').trim();
    if (!raw || userIdInput.value.trim()) return;
    try {
      const parts = raw.split('.');
      if (parts.length < 2) return;
      const json = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (json.userId) userIdInput.value = json.userId;
    } catch {
      /* ignore */
    }
  }

  document.getElementById('connect').addEventListener('click', function () {
    const token = String(tokenInput.value || '').trim();
    if (!token) {
      log('Connect: paste a JWT first.');
      return;
    }
    if (socket) {
      socket.close();
      socket = null;
    }
    tryFillUserIdFromJwt();
    const origin = window.location.origin;
    log('Connecting to ' + origin + ' (path /socket.io) …');
    socket = io(origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', function () {
      log('Socket connected, id=' + socket.id);
    });
    socket.on('connect_error', function (err) {
      log('connect_error: ' + (err && err.message ? err.message : String(err)));
    });
    socket.on('disconnect', function (reason) {
      log('disconnect: ' + reason);
    });
    ['driver_verified', 'account_verified', 'new_order_available', 'order_updated', 'order_completed'].forEach(
      function (ev) {
        socket.on(ev, function (payload) {
          log('← ' + ev + ' ' + JSON.stringify(payload).slice(0, 500));
        });
      }
    );
  });

  document.getElementById('disconnect').addEventListener('click', function () {
    if (socket) {
      socket.close();
      socket = null;
      log('Disconnected by user.');
    }
  });

  async function trigger(query) {
    const url = '/api/test/trigger-socket?' + query;
    log('GET ' + url);
    try {
      const res = await fetch(url, { credentials: 'omit' });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      log('HTTP ' + res.status + ' ' + (typeof body === 'string' ? body : JSON.stringify(body)));
    } catch (e) {
      log('fetch error: ' + e.message);
    }
  }

  document.getElementById('trigger-order').addEventListener('click', function () {
    trigger('type=order&district=Larnaca');
  });

  document.getElementById('trigger-verify').addEventListener('click', function () {
    const uid = String(userIdInput.value || '').trim();
    if (!uid) {
      log('Set User ID first (or connect once to auto-fill from JWT).');
      return;
    }
    trigger('type=verify&userId=' + encodeURIComponent(uid));
  });

  document.getElementById('trigger-all').addEventListener('click', function () {
    const uid = String(userIdInput.value || '').trim();
    let q = 'type=all&district=Larnaca';
    if (uid) q += '&userId=' + encodeURIComponent(uid);
    trigger(q);
  });

  log('Open this page from the API origin (e.g. http://localhost:3000/socket-test.html).');
})();
