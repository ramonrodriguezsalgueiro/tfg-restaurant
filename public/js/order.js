// public/js/order.js
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const init = { credentials: 'include', ...opts, headers };
  if (init.body && typeof init.body !== 'string') init.body = JSON.stringify(init.body);
  const res = await fetch(path, init);
  let data = null; try { data = await res.json(); } catch { data = {}; }
  if (res.status === 401) { location.href = '/'; throw new Error('No autenticado'); }
  if (!res.ok) throw new Error(data.message || 'Error');
  return data;
}

// --- Logout -----------------------------------------------------------------
document.getElementById('logout')?.addEventListener('click', async (e) => {
  e.preventDefault();
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  location.href = '/';
});

// --- DOM refs ---------------------------------------------------------------
const restSearch = document.getElementById('restSearch');
const restResults = document.getElementById('restResults');
const restaurantIdInput = document.getElementById('restaurantId');
const menuBox = document.getElementById('menu');       // donde pintamos inventario
const menuMsg = document.getElementById('menuMsg');
const myOrdersBox = document.getElementById('myOrders');
const orderForm = document.getElementById('orderForm');

let invCache = [];
let searchTimer = null;

// --- Buscador de restaurante ------------------------------------------------
async function performSearch(q) {
  try {
    const { restaurants } = await api(`/api/restaurants/search?q=${encodeURIComponent(q)}`);
    if (!restaurants.length) { restResults.style.display = 'none'; return; }

    restResults.innerHTML = restaurants.map(r => `
      <div class="menu-item" data-id="${r.id}" data-name="${r.name}">
        <div><strong>${r.name}</strong></div>
        <div class="muted">${r.cif}</div>
      </div>
    `).join('');
    restResults.style.display = 'block';

    restResults.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('click', async () => {
        restaurantIdInput.value = el.dataset.id;
        restSearch.value = el.dataset.name;
        restResults.style.display = 'none';
        await loadInventory();
      });
    });
  } catch (e) {
    console.error('[order] search error', e);
  }
}

restSearch?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = restSearch.value.trim();
  restaurantIdInput.value = '';
  if (!q || q.length < 2) { restResults.style.display = 'none'; return; }
  searchTimer = setTimeout(() => performSearch(q), 250);
});
restSearch?.addEventListener('blur', () => setTimeout(()=>restResults.style.display='none', 120));

// --- Inventario del restaurante --------------------------------------------
function renderInventory(items) {
  invCache = items || [];
  if (!invCache.length) {
    menuBox.innerHTML = `<p class="muted">No hay productos en inventario para este restaurante.</p>`;
    return;
  }
  menuBox.innerHTML = invCache.map(it => `
    <div class="card" data-id="${it.id}">
      <div class="row">
        <div style="flex:1">
          <div><strong>${it.name}</strong></div>
          <div class="muted">Stock: ${Number(it.quantity)} ${it.unit || ''}</div>
        </div>
        <div><input type="number" class="qty" min="0" step="1" value="0" style="width:90px" /></div>
      </div>
    </div>
  `).join('');

  // Validación visual de stock por input
  menuBox.querySelectorAll('.card').forEach(card => {
    const input = card.querySelector('.qty');
    input.addEventListener('input', () => {
      const id = Number(card.dataset.id);
      const it = invCache.find(x => x.id === id);
      const v = Number(input.value || 0);
      if (it && v > Number(it.quantity)) {
        input.style.borderColor = 'crimson';
        input.title = `Solo hay ${it.quantity} en stock`;
      } else {
        input.style.borderColor = '';
        input.title = '';
      }
    });
  });
}

async function loadInventory() {
  const rid = restaurantIdInput.value;
  if (!rid) { menuBox.innerHTML = ''; return; }
  try {
    const { items } = await api(`/api/inventory/by-restaurant?restaurantId=${encodeURIComponent(rid)}`);
    renderInventory(items);
  } catch (e) {
    console.error('[order] loadInventory error', e);
    menuBox.innerHTML = '<p class="muted">No se pudo cargar el inventario.</p>';
  }
}

// --- Mis pedidos (cliente) --------------------------------------------------
async function loadMyOrders() {
  try {
    if (!myOrdersBox) return;
    const { orders, items, inventoryItems } = await api('/api/orders/mine');

    const byOrder = new Map();
    for (const o of orders) byOrder.set(o.id, { order: o, menu: [], inv: [] });
    for (const it of (items || [])) {
      const g = byOrder.get(it.order_id); if (g) g.menu.push(it);
    }
    for (const iv of (inventoryItems || [])) {
      const g = byOrder.get(iv.order_id); if (g) g.inv.push(iv);
    }

    const rows = [...byOrder.values()].map(({ order, menu, inv }) => {
      const linesMenu = menu.map(m => `• ${m.name} x${m.qty}`).join('<br>');
      const linesInv  = inv.map(i => `• ${i.name} x${i.qty} ${i.unit||''}`).join('<br>');
      const lines = [linesMenu, linesInv].filter(Boolean).join('<br>');
      const created = order.created_at ? new Date(order.created_at) : new Date();
      return `
        <div class="card">
          <div class="row">
            <div>
              <div><strong>Pedido #${order.id}</strong> — ${order.status}</div>
              <div class="muted">${created.toLocaleString()}</div>
            </div>
            <div>Pago: ${order.payment_status}</div>
          </div>
          <div style="margin-top:6px">${lines || '<span class="muted">Sin líneas</span>'}</div>
        </div>
      `;
    }).join('');

    myOrdersBox.innerHTML = rows || '<p class="muted">Aún no tienes pedidos.</p>';
  } catch (e) {
    console.error('loadMyOrders error', e);
  }
}

// Llamada inicial
loadMyOrders();

// --- Botón "Solicitar": valida stock y crea pedido desde inventario ----------
document.getElementById('submitOrder')?.addEventListener('click', async () => {
  try {
    const rid = Number(restaurantIdInput.value);
    if (!rid) return alert('Selecciona un restaurante');

    // Leemos método/mesa/notas del formulario (si existen)
    const method = orderForm?.elements?.method?.value || 'dine-in';
    const tableNumber = orderForm?.elements?.tableNumber?.value || '';
    const notes = orderForm?.elements?.notes?.value || '';

    // Construimos líneas y validamos contra stock
    const lines = [];
    const faltantes = [];
    menuBox.querySelectorAll('.card').forEach(card => {
      const id = Number(card.dataset.id);
      const qty = Number(card.querySelector('.qty')?.value || 0);
      if (qty > 0) {
        const it = invCache.find(x => x.id === id);
        const stock = Number(it?.quantity ?? 0);
        if (qty > stock) {
          faltantes.push({ name: it?.name || `#${id}`, solicitado: qty, disponible: stock });
        } else {
          lines.push({ inventory_item_id: id, qty });
        }
      }
    });

    if (!lines.length) return alert('Indica cantidades a solicitar');
    if (faltantes.length) {
      const msg = faltantes.map(f => `• ${f.name}: pides ${f.solicitado}, hay ${f.disponible}`).join('\n');
      return alert(`No hay existencias suficientes:\n${msg}`);
    }

    // Enviamos el pedido "from-inventory"
    await api('/api/orders/from-inventory', {
      method: 'POST',
      body: { restaurantId: rid, lines, method, tableNumber, notes }
    });

    menuMsg.textContent = 'Solicitud enviada. Puedes pagar cuando quieras.';
    // Limpia inputs y refresca "Mis pedidos"
    menuBox.querySelectorAll('.qty').forEach(i => { i.value = 0; i.style.borderColor=''; i.title=''; });
    await loadMyOrders();
    // Recarga inventario para ver el stock descontado
    await loadInventory();
  } catch (err) {
    console.error('[order] submit error', err);
    alert(err.message);
  }
});

// --- Botón "Pagar (simulado)" del formulario --------------------------------
// Por ahora dejamos el pago “cuando se quiera”. Evitamos que el form haga POST a /order.
orderForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  alert('El pago es simulado y se podrá realizar más tarde. De momento tu pedido queda como "unpaid".');
});
