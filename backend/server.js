const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize database
initDatabase();

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/software', require('./routes/software'));
app.use('/api/hardware', require('./routes/hardware'));
app.use('/api/licenses', require('./routes/licenses'));
app.use('/api/integrations', require('./routes/integrations'));
app.use('/api/users', require('./routes/users'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/cloud-intelligence', require('./routes/cloud_intelligence'));
app.use('/api/cmdb', require('./routes/cmdb'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/mdm', require('./routes/mdm'));
app.use('/api/properties',  require('./routes/properties'));
app.use('/api/procurement', require('./routes/procurement'));
app.use('/api/agent',      require('./routes/agent'));

app.get('/api/health', (req, res) => res.json({ status: 'OK', app: 'Optima', version: '7.1.2' }));

app.listen(PORT, () => {
  console.log(`\n🚀 Optima Backend running on http://localhost:${PORT}`);
  console.log(`📊 API Health: http://localhost:${PORT}/api/health\n`);
});
