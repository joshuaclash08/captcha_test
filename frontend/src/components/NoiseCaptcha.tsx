import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    NoiseCaptcha?: {
      render: (element: string | HTMLElement) => void;
      getToken: (element?: string | HTMLElement) => string | null;
      reset: (element?: string | HTMLElement) => void;
      onVerify: (callback: (token: string) => void) => void;
    };
  }
}

interface NoiseCaptchaProps {
  siteKey: string;
  theme?: 'light' | 'dark';
  action?: string;
  onVerify?: (token: string) => void;
}

export default function NoiseCaptcha({ siteKey, theme = 'dark', action, onVerify }: NoiseCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onVerifyRef = useRef(onVerify);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  // Sync theme to widget dynamically
  useEffect(() => {
    const modal = document.getElementById("nc-modal-overlay");
    if (modal) {
      if (theme === 'dark') {
        modal.classList.add('nc-modal-dark');
      } else {
        modal.classList.remove('nc-modal-dark');
      }
    }
  }, [theme]);

  useEffect(() => {
    const scriptId = 'noise-captcha-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      // script.src = 'http://localhost:3000/captcha.js';
      script.src = 'https://captcha.sharingurl.com/captcha.js';
      script.async = true;
      document.body.appendChild(script);
    }
    
    let initialized = false;
    const initCaptcha = () => {
      // Small timeout to allow dom mutations if needed
      setTimeout(() => {
        if (window.NoiseCaptcha && containerRef.current && !initialized) {
          initialized = true;
          window.NoiseCaptcha.render(containerRef.current);
          window.NoiseCaptcha.onVerify((token) => {
            if (onVerifyRef.current) {
              onVerifyRef.current(token);
            }
          });
        }
      }, 50);
    };

    script.addEventListener('load', initCaptcha);
    if (window.NoiseCaptcha) {
      initCaptcha();
    }

    return () => {
      script.removeEventListener('load', initCaptcha);
    };
  }, [siteKey]);

  return (
    <div 
      ref={containerRef}
      data-noise-captcha 
      data-sitekey={siteKey}
      data-theme={theme}
      data-action={action}
      className={`nc-container mx-auto ${theme === 'dark' ? 'nc-dark' : ''}`}
    >
    </div>
  );
}