// Placeholder Index
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('API is working!'));
app.listen(process.env.PORT || 10000, () => console.log('Server running'));