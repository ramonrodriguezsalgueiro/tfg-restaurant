# TFG Restaurant App

App web sencilla para **reservas**, **pedidos** y **gestión (empleados)**.

## Requisitos
- Node.js 18+
- MySQL 8+

## Instalación
```bash
cp .env.example .env
# Edita .env con tus credenciales de MySQL

npm install
# Crear base de datos y tablas
# (desde tu cliente MySQL)
# > SOURCE schema.sql;

# Datos de prueba opcionales
# > SOURCE seed.sql;

npm run dev
```

Servidor en `http://localhost:4000`

## Rutas principales
- Cliente: `/book`, `/order`
- Empleado: `/bookManagement`, `/orderManagement`, `/inventory`
- Auth: `/` (login), `/register`

## Usuarios de prueba (seed.sql)
- Empleado: `employee@example.com` / `Password123!`
- Cliente: `customer@example.com` / `Password123!`
