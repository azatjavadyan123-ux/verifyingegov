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
    
    console.log('New visitor:', ip);
    console.log('User-Agent:', ua);
    
    res.json({
        status: 'ok',
        download: (Math.random() * 150 + 30).toFixed(2),
        upload: (Math.random() * 60 + 10).toFixed(2),
        ping: (Math.random() * 40 + 5).toFixed(0),
        server: 'Local Node',
        ip: ip,
        userAgent: ua
    });
});

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    res.json({ success: password === 'catmaster2026' });
});

app.get('/api/visitors', (req, res) => {
    res.json([]);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('CAT Tracker running on port', PORT);
    console.log('Dashboard: http://0.0.0.0:' + PORT + '/dashboard');
    console.log('Password: catmaster2026');
});
