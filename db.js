const mysql = require('mysql2');
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', // Sesuaikan dengan user MySQL Anda
    password: '', // Sesuaikan dengan password MySQL Anda
    database: 'kamen_rider'
});
module.exports = pool.promise();