const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

// Create a connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Export the pool to be used elsewhere
module.exports = pool.promise();
