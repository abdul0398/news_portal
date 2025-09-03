import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function runMigration() {
  let connection;
  
  try {
    console.log("🚀 Starting auth migration...");
    
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      multipleStatements: true
    });

    console.log("✅ Connected to database");

    // Read migration file
    const migrationPath = path.join(process.cwd(), 'migrations', 'auth_migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log("📄 Migration file loaded");

    // Execute migration
    await connection.execute(migrationSQL);
    
    console.log("✅ Auth migration completed successfully!");
    console.log("📋 Created tables:");
    console.log("   - admin_sessions (for session management)");
    
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("🔌 Database connection closed");
    }
  }
}

// Run migration
runMigration();