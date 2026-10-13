import connectPgSimple from "connect-pg-simple";
import dotenv from "dotenv";
import session from "express-session";
import pg from "pg";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const PgStore = connectPgSimple(session);

// Persist sessions in Postgres instead of express-session's MemoryStore,
// which leaks memory and loses every session on restart.
const store = new PgStore({
  pool: new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  tableName: "user_sessions",
  createTableIfMissing: true,
});

export const sessionConfig = {
  name: "trackwise_session",
  secret: process.env.SESSION_SECRET,
  store,
  resave: false,
  // Only create a session once something is stored in it (login, or the
  // OAuth state that passport writes before redirecting to Google), so
  // unauthenticated requests don't create sessions.
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 3600000 * 7, // 7 days
    secure: isProduction, // requires HTTPS
    httpOnly: true,
    // Lax still sends the cookie on the top-level redirect back from Google,
    // which the OAuth state check relies on.
    sameSite: "lax",
  },
  rolling: true,
};
