
import { Router } from "express";
import { pool } from "../db/db.js";
import { authRequired, requireRole } from "../middleware/auth.js";

export const router = Router();

function toNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

router.get("/", authRequired, requireRole("employee","admin"), async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const rid = isAdmin ? toNum(req.query.restaurantId, 0) : req.user.restaurant_id;

    if (!isAdmin && !rid) {
      return res.status(400).send({ status: "Error", message: "Empleado sin restaurante asociado" });
    }

    let sql = `SELECT id, name, sku, unit, quantity, reorder_level, restaurant_id
                 FROM inventory_items`;
    let params = {};

    if (isAdmin && rid) {
      sql += ` WHERE restaurant_id = :rid`;
      params.rid = rid;
    } else if (!isAdmin) {
      sql += ` WHERE restaurant_id = :rid`;
      params.rid = rid;
    }

    sql += ` ORDER BY name ASC`;

    const [rows] = await pool.query(sql, params);
    res.send({ status: "ok", items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send({ status: "Error", message: "No se pudo obtener el inventario" });
  }
});


router.post("/", authRequired, requireRole("employee","admin"), async (req, res) => {
  try {
    const { name, sku, unit = "unidad", quantity = 0, reorder_level = 0 } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).send({ status: "Error", message: "name es requerido" });
    }

    const isAdmin = req.user.role === "admin";
    const bodyRid = toNum(req.body?.restaurantId, 0);
    const rid = isAdmin ? (bodyRid || null) : req.user.restaurant_id;

    if (!rid) {
      return res.status(400).send({
        status: "Error",
        message: "restaurantId es obligatorio (o no tienes restaurante asociado)"
      });
    }

    const [result] = await pool.query(
      `INSERT INTO inventory_items (name, sku, unit, quantity, reorder_level, restaurant_id)
       VALUES (:n, :s, :u, :q, :r, :rid)`,
      { n: String(name).trim(), s: sku || null, u: unit || "unidad", q: toNum(quantity, 0), r: toNum(reorder_level, 0), rid }
    );

    const [rows] = await pool.query(
      `SELECT id, name, sku, unit, quantity, reorder_level, restaurant_id
         FROM inventory_items WHERE id = :id`,
      { id: result.insertId }
    );
    res.status(201).send({ status: "ok", item: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send({ status: "Error", message: "No se pudo crear el ítem" });
  }
});


router.put("/:id", authRequired, requireRole("employee","admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user.role === "admin";
    const rid = isAdmin ? null : req.user.restaurant_id;

    const [[owner]] = await pool.query(
      `SELECT id, restaurant_id FROM inventory_items WHERE id = :id`,
      { id }
    );
    if (!owner) return res.status(404).send({ status: "Error", message: "Ítem no encontrado" });
    if (!isAdmin && owner.restaurant_id !== rid) {
      return res.status(403).send({ status: "Error", message: "No puedes editar ítems de otro restaurante" });
    }

    const { name, sku, unit, quantity, reorder_level } = req.body || {};

    await pool.query(
      `UPDATE inventory_items SET
          name = COALESCE(:n, name),
          sku = COALESCE(:s, sku),
          unit = COALESCE(:u, unit),
          quantity = COALESCE(:q, quantity),
          reorder_level = COALESCE(:r, reorder_level)
       WHERE id = :id`,
      {
        id,
        n: (name !== undefined ? String(name).trim() : null),
        s: (sku !== undefined ? sku : null),
        u: (unit !== undefined ? unit : null),
        q: (quantity !== undefined ? toNum(quantity) : null),
        r: (reorder_level !== undefined ? toNum(reorder_level) : null),
      }
    );

    const [rows] = await pool.query(
      `SELECT id, name, sku, unit, quantity, reorder_level, restaurant_id
         FROM inventory_items WHERE id = :id`,
      { id }
    );
    res.send({ status: "ok", item: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send({ status: "Error", message: "No se pudo actualizar el ítem" });
  }
});


router.delete("/:id", authRequired, requireRole("employee","admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user.role === "admin";
    const rid = isAdmin ? null : req.user.restaurant_id;

    const [[owner]] = await pool.query(
      `SELECT id, restaurant_id FROM inventory_items WHERE id = :id`,
      { id }
    );
    if (!owner) return res.status(404).send({ status: "Error", message: "Ítem no encontrado" });
    if (!isAdmin && owner.restaurant_id !== rid) {
      return res.status(403).send({ status: "Error", message: "No puedes borrar ítems de otro restaurante" });
    }

    await pool.query(`DELETE FROM inventory_items WHERE id = :id`, { id });
    res.send({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ status: "Error", message: "No se pudo eliminar el ítem" });
  }
});


router.get("/by-restaurant", authRequired, async (req, res) => {
  try {
    const rid = Number(req.query.restaurantId);
    if (!rid) return res.status(400).send({ status: "Error", message: "restaurantId es requerido" });

    const [rows] = await pool.query(
      `SELECT id, name, unit, quantity, reorder_level
         FROM inventory_items
        WHERE restaurant_id = :rid
        ORDER BY name ASC`,
      { rid }
    );
    res.send({ status: "ok", items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send({ status: "Error", message: "No se pudo obtener el inventario del restaurante" });
  }
});   





