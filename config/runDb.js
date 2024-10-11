const pkg = require('pg');
const { Pool } = pkg;
require('dotenv').config();

const Client = new Pool({
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    port: process.env.POSTGRES_PORT,
});

const runDb = () => {
    Client.connect((err, client, release) => {
      if (err) {
        return console.error('Error acquiring client', err.stack);
      }
      console.log('Database connected successfully');
      release(); // releases the client back to the pool
    });
};

module.exports = {runDb};