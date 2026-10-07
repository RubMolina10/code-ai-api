import sql from 'mssql';

export const sqlConfig: sql.config = {

  user: process.env.DB_USER,

  password: process.env.DB_PASSWORD,

  server: process.env.DB_SERVER || 'localhost',

  port: Number(
    process.env.DB_PORT || 1433
  ),

  database: process.env.DB_NAME || 'CodeAI',

  options: {

    encrypt: false,

    trustServerCertificate: true

  },

  pool: {

    max: 10,

    min: 0,

    idleTimeoutMillis: 30000

  }

};


let pool: sql.ConnectionPool | null = null;


export async function getDatabase(): Promise<sql.ConnectionPool> {

  if (pool?.connected) {

    return pool;

  }


  if (pool?.connecting) {

    return pool;

  }


  pool = await new sql.ConnectionPool(
    sqlConfig
  ).connect();


  console.log(
    'SQL Server connected'
  );


  return pool;

}