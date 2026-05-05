const { Client } = require("pg");
require("dotenv").config({ quiet: true });

async function setupDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: false
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL");
    console.log("Database-first workflow: run `npm run db:pull` and `npm run db:generate` after schema changes.");
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.end();
  }
}

setupDatabase();
