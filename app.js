const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
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
    ssl: undefined // adjust if using RDS with SSL certs
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

// ================== FRONTEND PAGE ===================
app.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name, price, created_at FROM items ORDER BY id DESC LIMIT 10");
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Node + RDS Cake CRUD</title>
          <style>
            body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 2rem; }
            .card { border: 1px solid #ddd; border-radius: 12px; padding: 1rem 1.25rem; box-shadow: 0 2px 6px rgba(0,0,0,0.06); margin-bottom: 2rem; }
            table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
            th, td { padding: .5rem .75rem; border-bottom: 1px solid #eee; text-align: left; }
            input, button { padding: .5rem .75rem; margin: .25rem; border-radius: 6px; border: 1px solid #ccc; }
            button { background: #007bff; color: white; cursor: pointer; }
            button:hover { background: #0056b3; }
          </style>
        </head>
        <body>
          <h1>🎂 Cake Manager (Node.js + Amazon RDS)</h1>

          <div class="card">
            <h3>Add a Cake</h3>
            <form id="addForm">
              <input type="text" id="name" placeholder="Cake name" required />
              <input type="number" id="price" placeholder="Price" step="0.01" required />
              <button type="submit">Add</button>
            </form>
          </div>

          <div class="card">
            <h3>Update Cake</h3>
            <form id="updateForm">
              <input type="number" id="updateId" placeholder="Cake ID" required />
              <input type="text" id="updateName" placeholder="New name" required />
              <input type="number" id="updatePrice" placeholder="New price" step="0.01" required />
              <button type="submit">Update</button>
            </form>
          </div>

          <div class="card">
            <h3>Delete Cake</h3>
            <form id="deleteForm">
              <input type="number" id="deleteId" placeholder="Cake ID" required />
              <button type="submit">Delete</button>
            </form>
          </div>

          <div class="card">
            <h3>Latest Items</h3>
            <table>
              <thead><tr><th>ID</th><th>Name</th><th>Price</th><th>Created</th></tr></thead>
              <tbody id="itemsTable">
                ${rows.map(r => `<tr><td>${r.id}</td><td>${r.name}</td><td>${r.price}</td><td>${new Date(r.created_at).toISOString()}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>

          <script>
            async function refreshTable() {
              const res = await fetch('/api/items');
              const items = await res.json();
              document.getElementById('itemsTable').innerHTML = items.map(r =>
                \`<tr><td>\${r.id}</td><td>\${r.name}</td><td>\${r.price}</td><td>\${new Date(r.created_at).toISOString()}</td></tr>\`
              ).join('');
            }

            document.getElementById('addForm').addEventListener('submit', async e => {
              e.preventDefault();
              const name = document.getElementById('name').value;
              const price = document.getElementById('price').value;
              await fetch('/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, price }) });
              refreshTable();
              e.target.reset();
            });

            document.getElementById('updateForm').addEventListener('submit', async e => {
              e.preventDefault();
              const id = document.getElementById('updateId').value;
              const name = document.getElementById('updateName').value;
              const price = document.getElementById('updatePrice').value;
              await fetch('/api/items/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, price }) });
              refreshTable();
              e.target.reset();
            });

            document.getElementById('deleteForm').addEventListener('submit', async e => {
              e.preventDefault();
              const id = document.getElementById('deleteId').value;
              await fetch('/api/items/' + id, { method: 'DELETE' });
              refreshTable();
              e.target.reset();
            });
          </script>
        </body>
      </html>
    `;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================== CRUD APIs ===================
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

// ================== START APP ===================
(async () => {
  try {
    await initDb();
    app.listen(APP_PORT, () => {
      console.log(`✅ Server listening on port ${APP_PORT}`);
    });
  } catch (e) {
    console.error("Failed to init app:", e);
    process.exit(1);
  }
})();
