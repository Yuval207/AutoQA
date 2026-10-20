import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutoQA Demo App</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 720px;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    header {
      text-align: center;
      margin-bottom: 1rem;
    }
    h1 { font-size: 1.8rem; font-weight: 700; color: #818cf8; margin-bottom: 0.5rem; }
    p.subtitle { color: var(--text-muted); font-size: 0.95rem; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    .card-title {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 1rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.75rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    label { font-size: 0.85rem; color: var(--text-muted); font-weight: 500; }
    input[type="text"], input[type="password"] {
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.65rem 0.9rem;
      color: var(--text);
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="text"]:focus, input[type="password"]:focus {
      border-color: var(--primary);
    }
    .btn {
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 0.65rem 1.25rem;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary {
      background: #334155;
    }
    .btn-secondary:hover { background: #475569; }
    .btn-danger {
      background: var(--danger);
    }
    .alert {
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-top: 1rem;
      font-size: 0.9rem;
      font-weight: 500;
    }
    .alert-success { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid #059669; }
    .alert-danger { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid #dc2626; }
    .todo-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: #0f172a;
      border-radius: 8px;
      margin-bottom: 0.5rem;
      border: 1px solid var(--border);
    }
    .todo-title.done {
      text-decoration: line-through;
      color: var(--text-muted);
    }
    .badge {
      font-size: 0.75rem;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      font-weight: 600;
    }
    .badge-success { background: #065f46; color: #6ee7b7; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>AutoQA Target Application</h1>
      <p class="subtitle">E2E Fixture with Functional and Defective Features</p>
    </header>

    <!-- 1. Authentication -->
    <div class="card" id="auth-section">
      <div class="card-title">
        <span>User Authentication</span>
        <span id="auth-status-badge" class="badge" style="display:none;"></span>
      </div>
      <div id="login-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" placeholder="Username" aria-label="username" />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" placeholder="Password" aria-label="password" />
        </div>
        <button id="login-button" class="btn" onclick="handleLogin()">Log in</button>
      </div>
      <div id="logged-in-view" style="display: none;">
        <p id="welcome-message" style="font-size: 1.1rem; margin-bottom: 1rem;"></p>
        <button class="btn btn-secondary" onclick="handleLogout()">Log out</button>
      </div>
      <div id="auth-message" style="display: none;"></div>
    </div>

    <!-- 2. Task Management -->
    <div class="card" id="task-section">
      <div class="card-title">Task Management</div>
      <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
        <input type="text" id="task-input" name="task-input" placeholder="Enter task title..." style="flex: 1;" aria-label="task-input" />
        <button id="add-task-button" class="btn" onclick="addTask()">Add Task</button>
      </div>
      <div id="task-list">
        <div class="todo-item" id="task-1">
          <span class="todo-title" id="task-1-title">Initial Setup Checklist</span>
          <button class="btn btn-secondary" id="complete-task-1" onclick="completeTask('task-1')">Complete</button>
        </div>
      </div>
    </div>

    <!-- 3. Discount System -->
    <div class="card" id="discount-section">
      <div class="card-title">Discount Coupon System</div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
        Try valid coupon: <code style="color: #818cf8;">SAVE20</code> or promotional code: <code style="color: #f87171;">BUG50</code>
      </p>
      <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
        <input type="text" id="coupon-input" name="coupon-input" placeholder="Enter coupon code..." style="flex: 1;" aria-label="coupon-input" />
        <button id="apply-coupon-button" class="btn" onclick="applyCoupon()">Apply Coupon</button>
      </div>
      <div id="coupon-result" style="display: none;"></div>
    </div>
  </div>

  <script>
    // Authentication logic
    function handleLogin() {
      const u = document.getElementById('username').value.trim();
      const p = document.getElementById('password').value.trim();
      const msg = document.getElementById('auth-message');

      if (u === 'testuser' && p === 'password123') {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('logged-in-view').style.display = 'block';
        document.getElementById('welcome-message').innerText = 'Welcome, ' + u;
        msg.className = 'alert alert-success';
        msg.innerText = 'Welcome, ' + u;
        msg.style.display = 'block';
      } else {
        msg.className = 'alert alert-danger';
        msg.innerText = 'Invalid credentials';
        msg.style.display = 'block';
      }
    }

    function handleLogout() {
      document.getElementById('login-form').style.display = 'block';
      document.getElementById('logged-in-view').style.display = 'none';
      document.getElementById('auth-message').style.display = 'none';
    }

    // Task logic
    function addTask() {
      const input = document.getElementById('task-input');
      const val = input.value.trim();
      if (!val) return;

      const list = document.getElementById('task-list');
      const id = 'task-' + Date.now();
      const item = document.createElement('div');
      item.className = 'todo-item';
      item.id = id;
      item.innerHTML = \`
        <span class="todo-title">\${val}</span>
        <button class="btn btn-secondary" onclick="completeTask('\${id}')">Complete</button>
      \`;
      list.appendChild(item);
      input.value = '';
    }

    function completeTask(id) {
      const el = document.getElementById(id);
      if (el) {
        const title = el.querySelector('.todo-title');
        title.classList.toggle('done');
        const btn = el.querySelector('button');
        btn.innerText = 'Completed';
        btn.disabled = true;
      }
    }

    // Discount coupon logic (with genuine intentional bug for BUG50)
    function applyCoupon() {
      const code = document.getElementById('coupon-input').value.trim();
      const res = document.getElementById('coupon-result');

      if (code === 'SAVE20') {
        res.className = 'alert alert-success';
        res.innerText = '20% discount applied!';
        res.style.display = 'block';
      } else if (code === 'BUG50') {
        // Intentional defect for AutoQA to uncover!
        console.error('Unhandled TypeError: DiscountEngine.calculatePromo() is not a function at discount.js:42');
        res.className = 'alert alert-danger';
        res.innerText = 'Error: Coupon engine failed: discount overflow';
        res.style.display = 'block';
      } else {
        res.className = 'alert alert-danger';
        res.innerText = 'Invalid coupon code';
        res.style.display = 'block';
      }
    }
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'UP', timestamp: new Date().toISOString() }));
    return;
  }

  // Serve SPA root
  res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
  res.end(HTML_CONTENT);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AutoQA Demo App running on http://localhost:${PORT}`);
});
