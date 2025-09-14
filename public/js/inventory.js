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
  const { items } = await api('/api/inventory');
  const table = document.getElementById('inventoryTable');
  table.innerHTML = '<tr><th>Nombre</th><th>SKU</th><th>Unidad</th><th>Cantidad</th><th>Umbral</th><th>Acciones</th></tr>' +
    items.map(i => `
      <tr class="${Number(i.quantity) <= Number(i.reorder_level) ? 'danger' : ''}">
        <td>${i.name}</td>
        <td>${i.sku || ''}</td>
        <td>${i.unit}</td>
        <td><input data-id="${i.id}" data-field="quantity" type="number" step="0.01" value="${i.quantity}"/></td>
        <td><input data-id="${i.id}" data-field="reorder_level" type="number" step="0.01" value="${i.reorder_level}"/></td>
        <td><button data-id="${i.id}" data-del="1">Eliminar</button></td>
      </tr>
    `).join('');
  table.querySelectorAll('input[data-field]').forEach(inp => {
    inp.addEventListener('change', async () => {
      const id = inp.dataset.id, field = inp.dataset.field, value = inp.value;
      await api(`/api/inventory/${id}`, { method: 'PUT', body: JSON.stringify({ [field]: Number(value) }) });
      load();
    });
  });
  table.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar artículo?')) return;
      await api(`/api/inventory/${btn.dataset.id}`, { method: 'DELETE' });
      load();
    });
  });
}

document.getElementById('createItem').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const payload = Object.fromEntries(fd.entries());
  payload.quantity = Number(payload.quantity || 0);
  payload.reorder_level = Number(payload.reorder_level || 0);
  try {
    await api('/api/inventory', { method: 'POST', body: JSON.stringify(payload) });
    e.currentTarget.reset();
    load();
  } catch (err) {
    alert(err.message);
  }
});

load();
