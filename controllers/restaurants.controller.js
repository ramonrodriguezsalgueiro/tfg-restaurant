import { Router } from "express";
import { pool } from "../db/db.js";
import { authRequired, requireRole } from "../middleware/auth.js";

export const router = Router();

// Buscador público por nombre/CIF (para página de reservas)
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.send({ status: "ok", restaurants: [] });
  const like = `%${q}%`;
  const [rows] = await pool.query(
    `SELECT id, name, cif, slot_minutes, slot_capacity
       FROM restaurants
      WHERE active = 1 AND (name LIKE :like OR cif LIKE :like)
      ORDER BY name ASC
      LIMIT 20`,
    { like }
  );
  res.send({ status: "ok", restaurants: rows });
});

// Info del restaurante del empleado logueado
router.get("/mine", authRequired, requireRole("employee","admin"), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM restaurants WHERE id = :id AND active = 1`, { id: req.user.restaurant_id }
  );
  res.send({ status: "ok", restaurant: rows[0] || null });
});
