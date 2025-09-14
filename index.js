import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { methods as auth } from "./controllers/authentication.controller.js";
import { router as bookingRouter } from "./controllers/booking.controller.js";
import { router as orderRouter } from "./controllers/order.controller.js";
import { router as inventoryRouter } from "./controllers/inventory.controller.js";
import { router as restaurantsRouter } from "./controllers/restaurants.controller.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Pages (simple server-rendered files) ----------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "pages", "login.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "pages", "register.html")));
app.get("/order", (req, res) => res.sendFile(path.join(__dirname, "pages", "costumer", "order.html")));
app.get("/book", (req, res) => res.sendFile(path.join(__dirname, "pages", "costumer", "book.html")));
app.get("/inventory", (req, res) => res.sendFile(path.join(__dirname, "pages", "employee", "inventory.html")));
app.get("/orderManagement", (req, res) => res.sendFile(path.join(__dirname, "pages", "employee", "orderManagement.html")));
app.get("/bookManagement", (req, res) => res.sendFile(path.join(__dirname, "pages", "employee", "bookManagement.html")));

// ---------- API ----------
app.post("/api/register", auth.register);
app.post("/api/login", auth.login);
app.post("/api/logout", auth.logout);

app.use("/api/bookings", bookingRouter);
app.use("/api/orders", orderRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/restaurants", restaurantsRouter);

app.listen(PORT, () => {
  console.log("Servidor en puerto", PORT);
});
