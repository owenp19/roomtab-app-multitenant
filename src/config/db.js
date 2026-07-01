const mysql = require("mysql2/promise");

let pool = null;

function initDbPool() {
  if (pool) return pool;

  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "minibar_app";

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 20),
    queueLimit: 0,
    decimalNumbers: true,
    timezone: "-05:00",
    connectTimeout: 15000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    idleTimeout: 30000
  });

  pool.on("connection", function (conn) {
    conn.execute("SET SESSION wait_timeout = 28800");
  });

  return pool;
}

function getDbPool() {
  return initDbPool();
}

async function query(sql, params = []) {
  const p = getDbPool();
  try {
    const [rows] = await p.query(sql, params);
    return rows;
  } catch (err) {
    if (err.code === "ECONNRESET" || err.code === "PROTOCOL_CONNECTION_LOST") {
      pool = null;
      const p2 = getDbPool();
      const [rows] = await p2.query(sql, params);
      return rows;
    }
    throw err;
  }
}

module.exports = {
  initDbPool,
  getDbPool,
  query
};
