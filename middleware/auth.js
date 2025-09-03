import { getAdminSession } from "../database/index.js";

export async function requireAuth(req, res, next) {
  try {
    const sessionId = req.cookies?.admin_session;
    
    if (!sessionId) {
      // Check if this is an API request or browser request
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: "No session found" });
      } else {
        return res.redirect('/login');
      }
    }

    const session = await getAdminSession(sessionId);
    
    if (!session) {
      // Check if this is an API request or browser request
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: "Invalid or expired session" });
      } else {
        return res.redirect('/login');
      }
    }

    req.adminSession = session;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    if (req.path.startsWith('/api/')) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.redirect('/login');
    }
  }
}

export function validateAdminCredentials(username, password) {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  return username === adminUsername && password === adminPassword;
}