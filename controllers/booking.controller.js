import { Router } from "express";
import { pool } from "../db/db.js";
import { authRequired, requireRole } from "../middleware/auth.js";

export const router = Router();


router.get("/availability", async (req, res) => {
  try {
    const { restaurantId, date, time } = req.query;

    if (!restaurantId) {
      return res.status(400).send({ status: "Error", message: "restaurantId es requerido" });
    }
    if (!date || !time) {
      return res.status(400).send({ status: "Error", message: "date y time son requeridos" });
    }

    // Capacidad del restaurante
    const [[rest]] = await pool.query(
      `SELECT id, slot_capacity FROM restaurants WHERE id = :id AND active = 1`,
      { id: restaurantId }
    );
    if (!rest) {
      return res.status(404).send({ status: "Error", message: "Restaurante no encontrado o inactivo" });
    }

    // Comensales ya reservados en esa franja
    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(party_size),0) AS total
         FROM reservations
        WHERE restaurant_id = :rid
          AND date = :d
          AND time = :t
          AND status IN ('pending','confirmed','seated')`,
      { rid: restaurantId, d: date, t: time }
    );
    const used = Number(rows[0]?.total || 0);
    const capacityLeft = Math.max(0, Number(rest.slot_capacity ?? 40) - used);

    return res.send({ status: "ok", capacityLeft });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ status: "Error", message: "No se pudo consultar disponibilidad" });
  }
});


router.post("/", authRequired, async (req, res) => {
  try {
    const { restaurantId, partySize, date, time, notes } = req.body || {};

    if (!restaurantId) {
      return res.status(400).send({ status: "Error", message: "restaurantId es obligatorio" });
    }
    if (!partySize || !date || !time) {
      return res.status(400).send({ status: "Error", message: "partySize, date y time son obligatorios" });
    }

    // Validar que el restaurante existe y está activo
    const [[rest]] = await pool.query(
      `SELECT id, slot_capacity FROM restaurants WHERE id = :id AND active = 1`,
      { id: restaurantId }
    );
    if (!rest) {
      return res.status(404).send({ status: "Error", message: "Restaurante no encontrado o inactivo" });
    }

    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(party_size),0) AS total
         FROM reservations
        WHERE restaurant_id = :rid
          AND date = :d
          AND time = :t
          AND status IN ('pending','confirmed','seated')`,
      { rid: restaurantId, d: date, t: time }
    );
    const used = Number(rows[0]?.total || 0);
    const capacityLeft = Math.max(0, Number(rest.slot_capacity ?? 40) - used);
    if (Number(partySize) > capacityLeft) {
      return res.status(400).send({ status: "Error", message: "No hay capacidad suficiente para esa franja" });
    }

    // Insertar la reserva
    const [result] = await pool.query(
      `INSERT INTO reservations (restaurant_id, user_id, party_size, date, time, notes)
       VALUES (:rid, :uid, :ps, :d, :t, :n)`,
      {
        rid: restaurantId,
        uid: req.user.id,
        ps: Number(partySize),
        d: date,
        t: time,
        n: notes || null,
      }
    );

    const [created] = await pool.query(
      `SELECT * FROM reservations WHERE id = :id`,
      { id: result.insertId }
    );

    return res.status(201).send({ status: "ok", booking: created[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ status: "Error", message: "No se pudo crear la reserva" });
  }
});


router.get("/mine", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*
         FROM reservations r
        WHERE r.user_id = :uid
        ORDER BY r.date DESC, r.time DESC, r.id DESC`,
      { uid: req.user.id }
    );
    return res.send({ status: "ok", bookings: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ status: "Error", message: "No se pudieron obtener tus reservas" });
  }
});


router.get("/", authRequired, requireRole("employee", "admin"), async (req, res) => {
  try {
    if (!req.user.restaurant_id) {
      return res.status(400).send({ status: "Error", message: "Empleado sin restaurante asociado" });
    }
    const { date } = req.query;
    const dateClause = date ? "AND r.date = :d" : "";
    const params = date ? { rid: req.user.restaurant_id, d: date } : { rid: req.user.restaurant_id };

    const [rows] = await pool.query(
      `SELECT r.*, u.username, u.email
         FROM reservations r
         JOIN users u ON r.user_id = u.id
        WHERE r.restaurant_id = :rid
          ${dateClause}
        ORDER BY r.date ASC, r.time ASC, r.id ASC`,
      params
    );

    return res.send({ status: "ok", bookings: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ status: "Error", message: "No se pudieron listar las reservas" });
  }
});


router.patch("/:id/status", authRequired, requireRole("employee", "admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const allowed = ["pending", "confirmed", "seated", "completed", "cancelled"];

    if (!allowed.includes(status)) {
      return res.status(400).send({ status: "Error", message: "status inválido" });
    }
    if (!req.user.restaurant_id) {
      return res.status(400).send({ status: "Error", message: "Empleado sin restaurante asociado" });
    }

    // Asegurar que la reserva es del mismo restaurante
    const [[row]] = await pool.query(
      `SELECT id FROM reservations
        WHERE id = :id AND restaurant_id = :rid
        LIMIT 1`,
      { id, rid: req.user.restaurant_id }
    );
    if (!row) {
      return res.status(404).send({ status: "Error", message: "Reserva no encontrada en tu restaurante" });
    }

    await pool.query(
      `UPDATE reservations SET status = :s WHERE id = :id`,
      { s: status, id }
    );
    return res.send({ status: "ok" });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ status: "Error", message: "No se pudo actualizar el estado" });
  }
});


router.delete("/:id", authRequired, requireRole("employee", "admin"), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user.restaurant_id) {
      return res.status(400).send({ status: "Error", message: "Empleado sin restaurante asociado" });
    }

    const [[row]] = await pool.query(
      `SELECT id FROM reservations
        WHERE id = :id AND restaurant_id = :rid
        LIMIT 1`,
      { id, rid: req.user.restaurant_id }
    );
    if (!row) {
      return res.status(404).send({ status: "Error", message: "Reserva no encontrada en tu restaurante" });
    }

    await pool.query(`DELETE FROM reservations WHERE id = :id`, { id });
    return res.send({ status: "ok" });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ status: "Error", message: "No se pudo eliminar la reserva" });
  }
});
