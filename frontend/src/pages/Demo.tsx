import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { faker } from '@faker-js/faker';
import NoiseCaptcha from '../components/NoiseCaptcha';
import { ShieldCheck, Mail, User, AlertCircle, Loader2, Moon, Sun } from 'lucide-react';

export default function Demo() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Auto-fill random data when component mounts
  useEffect(() => {
    setName(faker.person.firstName());
    setEmail(`${faker.string.alphanumeric(6)}@example.com`);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setStatus('error');
      setErrorMsg('Please complete the CAPTCHA to continue.');
      return;
    }

    setLoading(true);
    setStatus('idle');
    setErrorMsg('');

    try { 
      // Vite 개발 서버에 띄워둔 가짜 백엔드 플러그인(/api/login)으로 요청
      const res = await fetch('/demo/signup', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ token, name, email }) 
      }); 
      
      const data = await res.json(); 
      
      if(data.success) { 
        setStatus('success'); 
      } else { 
        setStatus('error'); 
        console.error("Token verification failed:", data.error);
        setErrorMsg("Verification failed: " + data.error);
      } 
    } catch (err) { 
      setStatus('error'); 
      console.error(err);
      setErrorMsg("An error occurred during verification.");
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className={`flex min-h-[calc(100vh-4rem)] items-center justify-center p-6 transition-colors duration-300 ${theme === 'dark' ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 to-neutral-950' : 'bg-slate-50'}`}>
      <motion.div 
        className={`w-full max-w-[420px] relative rounded-3xl border p-8 backdrop-blur-2xl transition-all duration-300 ${theme === 'dark' ? 'border-white/10 bg-neutral-950/80 shadow-[0_0_50px_rgba(0,0,0,0.5)]' : 'border-neutral-200 bg-white/80 shadow-xl'}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={`absolute top-6 right-6 p-2 rounded-full transition-colors z-30 cursor-pointer ${
            theme === 'dark' 
              ? 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white' 
              : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900'
          }`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <div className="mb-10 text-center relative z-20">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg shadow-indigo-500/25 relative overflow-hidden">
             <div className="absolute inset-0 bg-black/10 backdrop-blur-sm z-10" />
             <ShieldCheck className="h-8 w-8 text-white relative z-20" />
          </div>
          <h2 className={`text-2xl font-bold tracking-tight transition-colors ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>Create an account</h2>
          <p className={`mt-2 text-sm transition-colors ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>Sign up to test the CAPTCHA</p>
        </div>

        {status === 'success' ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-8 text-center relative z-20"
          >
            <div className="mb-4 rounded-full bg-green-500/20 p-4 text-green-500">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h3 className={`text-xl font-semibold transition-colors ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>Sign Up Successful!</h3>
            <p className={`mt-2 text-sm transition-colors ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>CAPTCHA was verified properly.</p>
            <button 
              onClick={() => {
                window.location.reload();
              }}
              className={`mt-8 cursor-pointer rounded-lg px-6 py-2 text-sm font-medium transition-colors active:scale-[0.98] ${
                theme === 'dark'
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-neutral-900 text-white hover:bg-neutral-800'
              }`}
            >
              Test Again
            </button>
          </motion.div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-5 relative z-20">
            {status === 'error' && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                  theme === 'dark' ? 'border-red-500/20 bg-red-500/10 text-red-400' : 'border-red-200 bg-red-50 text-red-600'
                }`}
              >
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{errorMsg || 'Please complete the CAPTCHA to continue.'}</p>
              </motion.div>
            )}

            <div className="space-y-1.5">
              <label className={`text-xs font-semibold uppercase tracking-wider transition-colors ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>Nickname</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  className={`w-full rounded-xl border py-3 pl-11 pr-4 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                    theme === 'dark'
                      ? 'border-white/10 bg-black/40 text-white placeholder-neutral-500 focus:bg-black/60'
                      : 'border-neutral-200 bg-white text-neutral-900 placeholder-neutral-400 focus:bg-neutral-50'
                  }`}
                  placeholder="Alex"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-semibold uppercase tracking-wider transition-colors ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>Email Address</label>
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                <input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className={`w-full rounded-xl border py-3 pl-11 pr-4 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                    theme === 'dark'
                      ? 'border-white/10 bg-black/40 text-white placeholder-neutral-500 focus:bg-black/60'
                      : 'border-neutral-200 bg-white text-neutral-900 placeholder-neutral-400 focus:bg-neutral-50'
                  }`}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div className="pt-2 pb-2">
              <NoiseCaptcha 
                siteKey="nc_pk_844ba90ce0c0eb76ebfe71f3a7336bd6" 
                theme={theme}
                action="login"
                onVerify={(t) => {
                  setToken(t);
                  if (status === 'error') setStatus('idle');
                }} 
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="group relative w-full cursor-pointer overflow-hidden rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70 active:scale-[0.98] disabled:active:scale-100"
            >
              <div className="flex items-center justify-center gap-2">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span>Sign Up securely</span>}
              </div>
              
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}