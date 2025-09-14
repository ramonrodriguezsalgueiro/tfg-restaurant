// public/js/book.js
// Página de reservas (cliente) con buscador de restaurante y control de capacidad.

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const init = { credentials: 'include', ...opts, headers };
  // Asegura JSON en body si viene objeto
  if (init.body && typeof init.body !== 'string') init.body = JSON.stringify(init.body);

  const res = await fetch(path, init);
  let data = null;
  try { data = await res.json(); } catch { data = {}; }

  if (res.status === 401) {
    // Sesión expirada/no autenticado → vuelve a login
    location.href = '/';
    throw new Error('No autenticado');
  }
  if (!res.ok) {
    throw new Error(data.message || 'Error de red');
  }
  return data;
}

// --- Logout ---
const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await api('/api/logout', { method: 'POST' });
    } catch (_) {}
    location.href = '/';
  });
}

// --- Utilidades de formato ---
function fmtDate(d) {
  if (!d) return '';
  // d puede venir como '2025-09-07T00:00:00.000Z' o '2025-09-07'
  return String(d).substring(0, 10);
}
function fmtTime(t) {
  if (!t) return '';
  // t puede venir como '18:00:00' o '18:00:00.000Z'
  return String(t).substring(0, 5);
}

// --- Cargar "Mis reservas" ---
async function loadMine() {
  try {
    const { bookings } = await api('/api/bookings/mine');
    const table = document.getElementById('myBookings');
    if (!table) return;

    const head = '<tr><th>Restaurante</th><th>Fecha</th><th>Hora</th><th>Comensales</th><th>Estado</th><th>Notas</th></tr>';
    const rows = bookings.map(b => `
      <tr>
        <td>${b.restaurant_id ?? ''}</td>
        <td>${fmtDate(b.date)}</td>
        <td>${fmtTime(b.time)}</td>
        <td>${b.party_size}</td>
        <td>${b.status}</td>
        <td>${b.notes || ''}</td>
      </tr>
    `).join('');
    table.innerHTML = head + rows;
  } catch (err) {
    console.error(err);
    alert('No se pudieron cargar tus reservas');
  }
}

// --- Buscador de restaurantes ---
const restSearch = document.getElementById('restSearch');
const restResults = document.getElementById('restResults');
const restaurantIdInput = document.getElementById('restaurantId');

let searchTimer = null;

function hideResultsSoon() {
  // Pequeño retardo para permitir click en resultados antes de ocultar
  setTimeout(() => { if (restResults) restResults.style.display = 'none'; }, 150);
}

async function performSearch(q) {
  try {
    const { restaurants } = await api(`/api/restaurants/search?q=${encodeURIComponent(q)}`);
    if (!restaurants.length) {
      restResults.style.display = 'none';
      return;
    }
    restResults.innerHTML = restaurants.map(r => `
      <div class="menu-item" data-id="${r.id}" data-name="${r.name}">
        <div><strong>${r.name}</strong></div>
        <div class="muted">${r.cif}</div>
      </div>
    `).join('');
    restResults.style.display = 'block';

    restResults.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('click', () => {
        restaurantIdInput.value = el.dataset.id;
        restSearch.value = el.dataset.name;
        restResults.style.display = 'none';
      });
    });
  } catch (err) {
    console.error(err);
    restResults.style.display = 'none';
  }
}

if (restSearch && restResults && restaurantIdInput) {
  restSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = restSearch.value.trim();
    restaurantIdInput.value = ''; // si cambia el texto, resetea selección
    if (!q || q.length < 2) {
      restResults.style.display = 'none';
      return;
    }
    searchTimer = setTimeout(() => performSearch(q), 250);
  });

  restSearch.addEventListener('blur', hideResultsSoon);

  // Enter → selecciona el primer resultado listado (si hay)
  restSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = restResults.querySelector('[data-id]');
      if (first) {
        restaurantIdInput.value = first.dataset.id;
        restSearch.value = first.dataset.name;
        restResults.style.display = 'none';
      }
    }
  });
}

// --- Comprobar disponibilidad ---
const checkBtn = document.getElementById('checkAvailability');
if (checkBtn) {
  checkBtn.addEventListener('click', async () => {
    try {
      const form = document.getElementById('bookForm');
      const fd = new FormData(form);
      const date = fd.get('date');
      const time = fd.get('time');
      const restaurantId = restaurantIdInput.value;

      if (!restaurantId) return alert('Selecciona un restaurante');
      if (!date) return alert('Selecciona una fecha');
      if (!time) return alert('Selecciona una hora');

      const qs = new URLSearchParams({ restaurantId, date, time }).toString();
      const { capacityLeft } = await api(`/api/bookings/availability?${qs}`);
      document.getElementById('availability').textContent = `Capacidad restante: ${capacityLeft}`;
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  });
}

// --- Crear reserva ---
const bookForm = document.getElementById('bookForm');
if (bookForm) {
  bookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(bookForm);
      const payload = Object.fromEntries(fd.entries());
      payload.partySize = Number(payload.partySize || 0);
      payload.restaurantId = restaurantIdInput.value;

      if (!payload.restaurantId) return alert('Selecciona un restaurante');
      if (!payload.date) return alert('Selecciona una fecha');
      if (!payload.time) return alert('Selecciona una hora');
      if (!payload.partySize || payload.partySize < 1) return alert('Indica el número de comensales');

      await api('/api/bookings', { method: 'POST', body: payload });

      alert('Reserva creada');
      // Resetea campos principales pero mantiene el restaurante elegido para hacer otra reserva si quiere
      bookForm.reset();
      document.getElementById('availability').textContent = '';
      restSearch.value = restSearch.value; // mantiene lo que ya estaba escrito
      // restaurantIdInput.value se mantiene; si quieres limpiar también, descomenta la siguiente línea:
      // restaurantIdInput.value = '';
      loadMine();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  });
}

// Init
loadMine();
