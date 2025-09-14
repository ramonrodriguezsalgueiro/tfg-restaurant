import bcrypt from "bcryptjs";             // usa bcryptjs para evitar compilaciones nativas en Windows
import jwt from "jsonwebtoken";
import { pool } from "../db/db.js";        // pool de mysql2/promise(.js) con named placeholders activados

// ---- helpers ---------------------------------------------------------------

function issueToken(user) {
  // Incluimos restaurant_id en el token para poder filtrar datos por restaurante en el backend
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    restaurant_id: user.restaurant_id ?? null,
  };
  return jwt.sign(payload, process.env.JWT_SECRET || "dev-secret", { expiresIn: "7d" });
}

function sanitizeRole(role) {
  return ["customer", "employee", "admin"].includes(role) ? role : "customer";
}

function isStrongEnoughPassword(pwd) {
  // mínimo 6 caracteres (puedes endurecer esta regla si quieres)
  return typeof pwd === "string" && pwd.length >= 6;
}

// ---- controladores ---------------------------------------------------------

async function register(req, res) {
  try {
    const {
      username = "",
      email = "",
      password = "",
      role: rawRole = "customer",
      extra = {}, // Para empleado: { cif, restaurantName } (pero admitimos forma "plana" también)
    } = req.body || {};

    const role = sanitizeRole(String(rawRole || "customer"));

    // Validaciones básicas
    if (!String(username).trim() || !String(email).trim() || !password) {
      return res.status(400).send({ status: "Error", message: "username, email y password son obligatorios" });
    }
    if (!isStrongEnoughPassword(password)) {
      return res.status(400).send({ status: "Error", message: "La contraseña debe tener al menos 6 caracteres" });
    }

    // Si es empleado: necesita CIF + nombre del restaurante.
    let restaurantId = null;
    if (role === "employee") {
      // Admitimos distintas formas de llegada por si el front no envía 'extra'
      const cif = String(
        (extra && extra.cif) ?? req.body.cif ?? req.body.CIF ?? ""
      ).trim().toUpperCase();

      const restaurantName = String(
        (extra && extra.restaurantName) ?? req.body.restaurantName ?? req.body.restaurant ?? ""
      ).trim();

      if (!cif || !restaurantName) {
        return res.status(400).send({ status: "Error", message: "CIF y nombre del restaurante son obligatorios para empleados" });
      }

      // Upsert de restaurante por CIF
      const [exists] = await pool.query(
        `SELECT id FROM restaurants WHERE cif = :cif LIMIT 1`,
        { cif }
      );

      if (exists.length) {
        restaurantId = exists[0].id;
        // Actualizamos el nombre por si lo traen distinto/actualizado
        await pool.query(
          `UPDATE restaurants SET name = :n WHERE id = :id`,
          { n: restaurantName, id: restaurantId }
        );
      } else {
        const [ins] = await pool.query(
          `INSERT INTO restaurants (name, cif) VALUES (:n, :c)`,
          { n: restaurantName, c: cif }
        );
        restaurantId = ins.insertId;
      }
    }

    // Hash de contraseña (bcryptjs síncrono, robusto y sin dependencias nativas)
    const hash = bcrypt.hashSync(password, 10);

    // Alta de usuario (guardamos restaurant_id si aplica)
    const [result] = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, restaurant_id)
       VALUES (:u, :e, :p, :r, :rid)`,
      {
        u: String(username).trim(),
        e: String(email).trim().toLowerCase(),
        p: hash,
        r: role,
        rid: restaurantId,
      }
    );

    // Recuperamos el usuario “limpio” para el token/respuesta
    const userId = result.insertId;
    const [rows] = await pool.query(
      `SELECT id, username, email, role, restaurant_id FROM users WHERE id = :id`,
      { id: userId }
    );
    const user = rows[0];

    // Emitimos token y lo dejamos en cookie HttpOnly
    const token = issueToken(user);
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 3600 * 1000,
    });

    return res.status(201).send({ status: "ok", user, token });
  } catch (err) {
    // Duplicados de email/username
    if (err && err.code === "ER_DUP_ENTRY") {
      const msg = (err.message || "").includes("email")
        ? "Ese email ya está registrado"
        : "Ese nombre de usuario ya existe";
      return res.status(400).send({ status: "Error", message: msg });
    }
    console.error(err);
    return res.status(500).send({ status: "Error", message: "Error interno al registrar" });
  }
}

async function login(req, res) {
  try {
    const rawUser = (req.body?.user ?? "").trim();   // puede ser username o email
    const password = req.body?.password ?? "";

    if (!rawUser || !password) {
      return res.status(400).send({ status: "Error", message: "Usuario y contraseña son obligatorios" });
    }

    const [rows] = await pool.query(
      `SELECT id, username, email, password_hash, role, restaurant_id
         FROM users
        WHERE username = :u OR email = :u
        LIMIT 1`,
      { u: rawUser }
    );
    if (!rows.length) {
      return res.status(400).send({ status: "Error", message: "Credenciales inválidas" });
    }

    const userDb = rows[0];
    const ok = bcrypt.compareSync(password, userDb.password_hash);
    if (!ok) {
      return res.status(400).send({ status: "Error", message: "Credenciales inválidas" });
    }

    const user = {
      id: userDb.id,
      username: userDb.username,
      email: userDb.email,
      role: userDb.role,
      restaurant_id: userDb.restaurant_id ?? null,
    };

    const token = issueToken(user);
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 3600 * 1000,
    });

    return res.status(200).send({ status: "ok", user, token });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ status: "Error", message: "Error interno al iniciar sesión" });
  }
}

async function logout(req, res) {
  res.clearCookie("token");
  return res.send({ status: "ok" });
}

// ---- export ---------------------------------------------------------------

export const methods = { register, login, logout };
