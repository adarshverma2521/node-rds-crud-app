const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const {
  DB_HOST,
  DB_PORT = 3306,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  APP_PORT = 3000,
} = process.env;

if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.error("Missing DB env vars. Check .env");
  process.exit(1);
}

let pool;
async function initDb() {
  pool = await mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    connectionLimit: 10,
    ssl: undefined // RDS MySQL typically doesn't require client certs by default
  });
  // Create table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
}

app.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name, price, created_at FROM items ORDER BY id DESC LIMIT 10");
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Node + RDS CRUD Demo</title>
          <style>
            body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 2rem; }
            .card { border: 1px solid #ddd; border-radius: 12px; padding: 1rem 1.25rem; box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
            table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
            th, td { padding: .5rem .75rem; border-bottom: 1px solid #eee; text-align: left; }
            .hint { color: #666; font-size: 0.9rem; }
            code { background: #f6f8fa; padding: .2rem .4rem; border-radius: 6px; }
          </style>
        </head>
        <body>
          <h1>✅ Node.js + Amazon RDS (MySQL) CRUD</h1>
          <div class="card">
            <p>Connected to DB: <code>${DB_NAME}</code> at <code>${DB_HOST}:${DB_PORT}</code></p>
            <p class="hint">Try the API:</p>
            <ul>
              <li>GET <code>/api/items</code></li>
              <li>POST <code>/api/items</code> {"name": "Cake", "price": 5.99}</li>
              <li>GET <code>/api/items/:id</code></li>
              <li>PUT <code>/api/items/:id</code> {"name": "New", "price": 9.99}</li>
              <li>DELETE <code>/api/items/:id</code></li>
            </ul>
            <h3>Latest Items</h3>
            <table>
              <thead><tr><th>ID</th><th>Name</th><th>Price</th><th>Created</th></tr></thead>
              <tbody>
                ${rows.map(r => `<tr><td>${r.id}</td><td>${r.name}</td><td>${r.price}</td><td>${new Date(r.created_at).toISOString()}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CRUD
app.get("/api/items", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name, price, created_at FROM items ORDER BY id DESC");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/items/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name, price, created_at FROM items WHERE id=?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/items", async (req, res) => {
  try {
    const { name, price } = req.body;
    if (!name || typeof price === "undefined") return res.status(400).json({ error: "name and price required" });
    const [result] = await pool.query("INSERT INTO items (name, price) VALUES (?, ?)", [name, price]);
    res.status(201).json({ id: result.insertId, name, price });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/items/:id", async (req, res) => {
  try {
    const { name, price } = req.body;
    const [result] = await pool.query("UPDATE items SET name=?, price=? WHERE id=?", [name, price, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Not found" });
    res.json({ id: Number(req.params.id), name, price });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/items/:id", async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM items WHERE id=?", [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

(async () => {
  try {
    await initDb();
    app.listen(APP_PORT, () => {
      console.log(`Server listening on port ${APP_PORT}`);
    });
  } catch (e) {
    console.error("Failed to init app:", e);
    process.exit(1);
  }
})();
