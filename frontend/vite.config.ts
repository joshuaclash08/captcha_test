import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

type VerifyResponse = {
  valid?: boolean
  error?: string
}

function isVerifyResponse(value: unknown): value is VerifyResponse {
  if (typeof value !== 'object' || value === null) return false
  const maybe = value as Record<string, unknown>
  const validOk = !('valid' in maybe) || typeof maybe.valid === 'boolean'
  const errorOk = !('error' in maybe) || typeof maybe.error === 'string'
  return validOk && errorOk
}

// Vite 개발 서버 내에서 가짜 백엔드 API 역할을 해주는 커스텀 플러그인
function demoBackendPlugin(): Plugin {
  return {
    name: 'demo-backend',
    configureServer(server) {
      server.middlewares.use('/demo/signup', (req, res, next) => {
        if (req.method !== 'POST') return next();

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { token, name, email } = JSON.parse(body);
            if (!token) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "Captcha token is required" }));
            }

            // 클라이언트 IP 추출 (Vite/Node 미들웨어 환경)
            // x-forwarded-for 헤더가 있으면 첫 번째 값을 사용, 없으면 socket.remoteAddress 활용
            const forwarded = req.headers['x-forwarded-for'];
            const xForwardedFor = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
            // IPv6 로컬 주소(::1)는 IPv4(127.0.0.1)로 통일
            let clientIp = xForwardedFor?.trim() || req.socket.remoteAddress || '127.0.0.1';
            if (clientIp === '::1') {
              clientIp = '127.0.0.1';
            }

            // 데모 사이트의 Vite 서버가 진짜 캡챠 서버로 시크릿키를 포함해 검증 요청
            const verifyRes = await fetch("https://captcha.sharingurl.com/api/captcha/validate-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token,
                secret: "nc_sk_bce9aa9b19b26436ab605619061d1ec4f15952aba1006c6c86a4754aaf1305a4",
                ip: clientIp // 추가적인 보안을 위해 토큰을 생성한 클라이언트의 IP를 함께 보냄 (옵션)
              }),
            });

            const verifyRaw: unknown = await verifyRes.json();
            const verifyData: VerifyResponse = isVerifyResponse(verifyRaw)
              ? verifyRaw
              : { valid: false, error: 'Invalid response from captcha server' };

            res.setHeader('Content-Type', 'application/json');
            if (!verifyData.valid) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: verifyData.error ?? 'Captcha validation failed' }));
            }

            // 검증 통과 후 로직 (예: DB 저장 성공)
            console.log(`[Demo Backend] User ${name} (${email}) verified!`);
            res.end(JSON.stringify({ success: true, message: "User registered successfully!" }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Internal Server Error" }));
          }
        });
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), demoBackendPlugin()],
  server: { 
    port: 5173
  }
})
