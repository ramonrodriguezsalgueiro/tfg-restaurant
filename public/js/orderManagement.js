async function api(path, opts={}) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.message || 'Error');
  return data;
}
document.getElementById('logout').addEventListener('click', async (e)=>{
  e.preventDefault();
  await api('/api/logout', { method: 'POST' });
  location.href = '/';
});
async function load() {
  const status = document.getElementById('statusFilter').value;
  const { orders } = await api('/api/orders' + (status ? `?status=${encodeURIComponent(status)}` : ''));
  const table = document.getElementById('orders');
  table.innerHTML = '<tr><th>Pedido</th><th>Cliente</th><th>Método</th><th>Estado</th><th>Total</th><th>Acciones</th></tr>' +
    orders.map(o => `
      <tr>
        <td>#${o.id}</td>
        <td>${o.username || ''} <small class="muted">${o.email || ''}</small></td>
        <td>${o.method}${o.table_number ? ' · Mesa '+o.table_number : ''}</td>
        <td>${o.status}</td>
        <td>${Number(o.total||0).toFixed(2)}€</td>
        <td>
          ${['new','preparing','ready','served','cancelled'].map(s => `<button data-id="${o.id}" data-status="${s}">${s}</button>`).join(' ')}
        </td>
      </tr>
    `).join('');
  table.querySelectorAll('button[data-status]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api(`/api/orders/${btn.dataset.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.status }) });
      load();
    });
  });
}
document.getElementById('refresh').addEventListener('click', load);
load();
