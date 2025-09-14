// public/js/register.js
async function api(path, opts={}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.message || 'Error');
  return data;
}

const roleSelect = document.getElementById('roleSelect');
const customerFields = document.getElementById('customerFields');
const employeeFields = document.getElementById('employeeFields');

function setDisabled(fieldset, disabled) {
  fieldset.querySelectorAll('input,select,textarea').forEach(el => el.disabled = disabled);
}

function updateFields() {
  const role = roleSelect.value;
  const isCustomer = role === 'customer';
  customerFields.classList.toggle('hidden', !isCustomer);
  employeeFields.classList.toggle('hidden', isCustomer);
  setDisabled(customerFields, !isCustomer);
  setDisabled(employeeFields, isCustomer);
}
roleSelect.addEventListener('change', updateFields);
updateFields(); // estado inicial

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);

  const role = fd.get('role') || 'customer';
  const payload = {
    username: fd.get('username'),
    email: fd.get('email'),
    password: fd.get('password'),
    role,
    extra: {}
  };

  if (role === 'customer') {
    payload.extra = {
      phone: (fd.get('phone') || '').trim(),
      allergies: (fd.get('allergies') || '').trim()
    };
  } else if (role === 'employee') {
    payload.extra = {
      cif: (fd.get('cif') || '').trim().toUpperCase(),
      restaurantName: (fd.get('restaurantName') || '').trim()
    };
  }

  // console.log('payload', payload); // <- Descomenta si quieres ver qué se envía

  try {
    const { user } = await api('/api/register', { method: 'POST', body: JSON.stringify(payload) });
    if (user.role === 'employee' || user.role === 'admin') {
      location.href = '/orderManagement';
    } else {
      location.href = '/book';
    }
  } catch (err) {
    alert(err.message);
  }
});
