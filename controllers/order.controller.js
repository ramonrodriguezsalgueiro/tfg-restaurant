
import { Router } from "express";
import { pool } from "../db/db.js";
import { authRequired, requireRole } from "../middleware/auth.js";

export const router = Router();


router.get("/menu", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, description, price
         FROM menu_items
        WHERE active = 1
        ORDER BY id ASC`
    );
    return res.send({ status: "ok", menu: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ status: "Error", message: "No se pudo obtener el menú" });
  }
});


router.post("/", authRequired, async (req, res) => {
  const { restaurantId, items = [], method = "dine-in", tableNumber = "", notes = "" } = req.body || {};

  if (!restaurantId) {
    return res.status(400).send({ status: "Error", message: "restaurantId es obligatorio" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).send({ status: "Error", message: "items es requerido" });
  }
  if (!["dine-in", "pickup"].includes(method)) {
    return res.status(400).send({ status: "Error", message: "method inválido" });
  }

  const conn = await pool.getConnection();
  try {
    // Validar restaurante activo
    const [[rest]] = await conn.query(
      `SELECT id FROM restaurants WHERE id = :id AND active = 1`,
      { id: restaurantId }
    );
    if (!rest) {
      conn.release();
      return res.status(404).send({ status: "Error", message: "Restaurante no encontrado o inactivo" });
    }

    // Cargar precios de menú
    const ids = items.map((i) => Number(i.menu_item_id)).filter(Boolean);
    if (!ids.length) {
      conn.release();
      return res.status(400).send({ status: "Error", message: "items inválidos" });
    }

    const [menuRows] = await conn.query(
      `SELECT id, price FROM menu_items WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    const priceMap = Object.fromEntries(menuRows.map((m) => [String(m.id), Number(m.price)]));

    // Validaciones
    for (const it of items) {
      const price = priceMap[String(Number(it.menu_item_id))];
      if (price == null) {
        conn.release();
        return res.status(400).send({ status: "Error", message: `Artículo no encontrado (id=${it.menu_item_id})` });
      }
      const qty = Number(it.qty || 0);
      if (!Number.isFinite(qty) || qty <= 0) {
        conn.release();
        return res.status(400).send({ status: "Error", message: `Cantidad inválida para id=${it.menu_item_id}` });
      }
    }

    await conn.beginTransaction();

    // Insertar pedido (mantienes 'authorized')
    const [result] = await conn.query(
      `INSERT INTO orders (restaurant_id, user_id, status, method, table_number, notes, payment_status)
       VALUES (:rid, :uid, 'new', :m, :tn, :n, 'authorized')`,
      {
        rid: restaurantId,
        uid: req.user.id,
        m: method,
        tn: tableNumber || null,
        n: notes || null,
      }
    );
    const orderId = result.insertId;

    // Insertar líneas
    for (const it of items) {
      const qty = Math.max(1, Number(it.qty || 1));
      const price = priceMap[String(Number(it.menu_item_id))];
      await conn.query(
        `INSERT INTO order_items (order_id, menu_item_id, qty, price)
         VALUES (:o, :m, :q, :p)`,
        { o: orderId, m: Number(it.menu_item_id), q: qty, p: price }
      );
    }

    await conn.commit();
    return res.status(201).send({ status: "ok", orderId });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    console.error(err);
    return res.status(500).send({ status: "Error", message: "No se pudo crear el pedido" });
  } finally {
    conn.release();
  }
});


router.post("/from-inventory", authRequired, async (req, res) => {
  const {
    restaurantId,
    lines = [],
    method = "dine-in",
    tableNumber = "",
    notes = ""
  } = req.body || {};

  if (!restaurantId) return res.status(400).send({ status: "Error", message: "restaurantId es obligatorio" });
  if (!Array.isArray(lines) || !lines.length) return res.status(400).send({ status: "Error", message: "Añade productos de inventario" });
  if (!["dine-in","pickup"].includes(method)) return res.status(400).send({ status: "Error", message: "method inválido" });

  const conn = await pool.getConnection();
  try {
    // Restaurante activo
    const [[rest]] = await conn.query(`SELECT id FROM restaurants WHERE id=:id AND active=1`, { id: restaurantId });
    if (!rest) { conn.release(); return res.status(404).send({ status: "Error", message: "Restaurante no encontrado o inactivo" }); }

    // Validar cantidades
    const ids = lines.map(l => Number(l.inventory_item_id)).filter(Boolean);
    if (!ids.length) { conn.release(); return res.status(400).send({ status: "Error", message: "lines inválidas" }); }
    for (const l of lines) {
      const q = Number(l.qty || 0);
      if (!Number.isFinite(q) || q <= 0) {
        conn.release();
        return res.status(400).send({ status: "Error", message: `Cantidad inválida para id=${l.inventory_item_id}` });
      }
    }

    await conn.beginTransaction();

    // Bloquear stock de esos ítems del restaurante (consistencia)
    const placeholders = ids.map(() => "?").join(",");
    const [locked] = await conn.query(
      `SELECT id, quantity
         FROM inventory_items
        WHERE restaurant_id = ? AND id IN (${placeholders})
        FOR UPDATE`,
      [restaurantId, ...ids]
    );
    const stockMap = new Map(locked.map(r => [Number(r.id), Number(r.quantity)]));

    // Verificar stock
    const faltantes = [];
    for (const l of lines) {
      const have = stockMap.get(Number(l.inventory_item_id));
      if (have == null) {
        await conn.rollback();
        conn.release();
        return res.status(400).send({ status: "Error", message: `Producto no pertenece al restaurante o no existe (id=${l.inventory_item_id})` });
      }
      if (Number(l.qty) > have) {
        faltantes.push({ inventory_item_id: Number(l.inventory_item_id), solicitado: Number(l.qty), disponible: have });
      }
    }
    if (faltantes.length) {
      await conn.rollback();
      conn.release();
      return res.status(400).send({ status: "Error", message: "No hay existencias suficientes", faltantes });
    }

    // Crear pedido (sin autorizar el pago)
    const [ins] = await conn.query(
      `INSERT INTO orders (restaurant_id, user_id, status, method, table_number, notes, payment_status)
       VALUES (:rid, :uid, 'new', :m, :tn, :n, 'unpaid')`,
      { rid: restaurantId, uid: req.user.id, m: method, tn: tableNumber || null, n: notes || null }
    );
    const orderId = ins.insertId;

    // Guardar líneas + DESCONTAR stock de cada ítem
    for (const l of lines) {
      const itemId = Number(l.inventory_item_id);
      const reqQty = Number(l.qty);

      await conn.query(
        `INSERT INTO order_inventory_items (order_id, inventory_item_id, qty)
         VALUES (:o, :i, :q)`,
        { o: orderId, i: itemId, q: reqQty }
      );

      const [upd] = await conn.query(
        `UPDATE inventory_items
            SET quantity = quantity - :q
          WHERE id = :id
            AND restaurant_id = :rid
            AND quantity >= :q`,
        { q: reqQty, id: itemId, rid: restaurantId }
      );
      if (upd.affectedRows !== 1) {
        await conn.rollback();
        conn.release();
        return res.status(409).send({
          status: "Error",
          message: "Stock insuficiente por concurrencia, vuelve a intentarlo"
        });
      }
    }

    await conn.commit();
    res.status(201).send({ status: "ok", orderId });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error(err);
    res.status(500).send({ status: "Error", message: "No se pudo crear el pedido desde inventario" });
  } finally {
    conn.release();
  }
});


router.get("/mine", authRequired, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT *
         FROM orders
        WHERE user_id = :uid
        ORDER BY id DESC`,
      { uid: req.user.id }
    );

    const ids = orders.map((o) => o.id);
    let items = [];
    let inventoryItems = [];

    if (ids.length) {
      // Líneas de MENÚ
      const [rowsMenu] = await pool.query(
        `SELECT oi.*, mi.name
           FROM order_items oi
           JOIN menu_items mi ON mi.id = oi.menu_item_id
          WHERE oi.order_id IN (${ids.map(() => "?").join(",")})
          ORDER BY oi.order_id`,
        ids
      );
      items = rowsMenu;

      // Líneas de INVENTARIO
      const [rowsInv] = await pool.query(
        `SELECT oii.*, ii.name, ii.unit
           FROM order_inventory_items oii
           JOIN inventory_items ii ON ii.id = oii.inventory_item_id
          WHERE oii.order_id IN (${ids.map(() => "?").join(",")})
          ORDER BY oii.order_id`,
        ids
      );
      inventoryItems = rowsInv;
    }

    return res.send({ status: "ok", orders, items, inventoryItems });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ status: "Error", message: "No se pudieron obtener tus pedidos" });
  }
});


router.get("/", authRequired, requireRole("employee", "admin"), async (req, res) => {
  try {
    if (!req.user.restaurant_id) {
      return res.status(400).send({ status: "Error", message: "Empleado sin restaurante asociado" });
    }
    const { status } = req.query;
    const whereStatus = status ? "AND o.status = :s" : "";

    const [rows] = await pool.query(
      `SELECT o.*, u.username, u.email, COALESCE(SUM(oi.qty * oi.price),0) AS total
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.restaurant_id = :rid
          ${whereStatus}
        GROUP BY o.id
        ORDER BY o.created_at DESC`,
      status ? { rid: req.user.restaurant_id, s: status } : { rid: req.user.restaurant_id }
    );

    return res.send({ status: "ok", orders: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ status: "Error", message: "No se pudieron listar los pedidos" });
  }
});


router.patch("/:id/status", authRequired, requireRole("employee", "admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const allowed = ["new", "preparing", "ready", "served", "cancelled"];

    if (!allowed.includes(status)) {
      return res.status(400).send({ status: "Error", message: "status inválido" });
    }
    if (!req.user.restaurant_id) {
      return res.status(400).send({ status: "Error", message: "Empleado sin restaurante asociado" });
    }

    // Verificar pertenencia del pedido al restaurante del empleado
    const [[row]] = await pool.query(
      `SELECT id FROM orders
        WHERE id = :id AND restaurant_id = :rid
        LIMIT 1`,
      { id, rid: req.user.restaurant_id }
    );
    if (!row) {
      return res.status(404).send({ status: "Error", message: "Pedido no encontrado en tu restaurante" });
    }

    await pool.query(
      `UPDATE orders SET status = :s WHERE id = :id`,
      { s: status, id }
    );

    return res.send({ status: "ok" });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ status: "Error", message: "No se pudo actualizar el estado" });
  }
});
