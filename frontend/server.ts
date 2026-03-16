import { serve } from "bun";
import { join } from "path";
import { statSync } from "fs";

// Production minimal server for frontend distribution and mock API

const DIST_DIR = join(import.meta.dir, "dist");
const PORT = process.env.PORT || 5173;

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Mock Backend API for Demo
    if (url.pathname === "/demo/signup" && req.method === "POST") {
      try {
        const body = await req.json();
        const { token, name, email } = body;

        if (!token) {
          return new Response(JSON.stringify({ error: "Captcha token is required" }), { 
            status: 400, 
            headers: { "Content-Type": "application/json" } 
          });
        }

        const forwarded = req.headers.get("x-forwarded-for");
        const clientIp = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

        // Validate token using production backend URL
        const verifyRes = await fetch("https://captcha.sharingurl.com/api/captcha/validate-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            secret: "nc_sk_bce9aa9b19b26436ab605619061d1ec4f15952aba1006c6c86a4754aaf1305a4",
            ip: clientIp
          }),
        });

        const verifyData: any = await verifyRes.json();

        if (!verifyData.valid) {
          return new Response(JSON.stringify({ success: false, error: verifyData.error ?? "Captcha validation failed" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        console.log(`[Demo Backend] User ${name} (${email}) verified!`);
        return new Response(JSON.stringify({ success: true, message: "User registered successfully!" }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (e) {
        console.error("Demo signup error:", e);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
          status: 500, 
          headers: { "Content-Type": "application/json" } 
        });
      }
    }

    // Serve Static Files for SPA
    let filePath = join(DIST_DIR, url.pathname);
    
    try {
      if (statSync(filePath).isDirectory()) {
        filePath = join(filePath, "index.html");
      }
    } catch {
      // If file doesn't exist, we'll let it fallback below
    }

    const file = Bun.file(filePath);
    if (await file.exists()) {
      const response = new Response(file);
      // Give basic static asset headers
      if (filePath.endsWith('.js')) {
        response.headers.set('Content-Type', 'application/javascript');
      } else if (filePath.endsWith('.css')) {
        response.headers.set('Content-Type', 'text/css');
      } else if (filePath.endsWith('.html')) {
        response.headers.set('Content-Type', 'text/html');
      }
      return response;
    }
    
    // Fallback to index.html for CSR React Router
    const indexFile = Bun.file(join(DIST_DIR, "index.html"));
    const response = new Response(indexFile);
    response.headers.set('Content-Type', 'text/html');
    return response;
  }
});

console.log(`🚀 Frontend static server running on port ${PORT}`);
