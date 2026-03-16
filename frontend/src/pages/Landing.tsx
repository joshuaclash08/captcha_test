import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Lock, EyeOff, Zap } from 'lucide-react';
import NoiseProofPreview from '../components/NoiseProofPreview';

const FADE_UP = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

export default function Landing() {
  return (
    <div className="flex flex-col items-center justify-center">
      {/* Hero Section */}
      <section className="relative flex min-h-[90vh] w-full max-w-6xl items-center px-6 py-14">
        {/* Background elements */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 via-neutral-950 to-neutral-950"></div>

        <div className="grid w-full items-center gap-12 lg:grid-cols-2">
          <motion.div
            className="order-2 flex flex-col items-start text-left lg:order-1"
            initial="hidden"
            animate="visible"
            variants={FADE_UP}
          >
            <motion.h1
              className="mb-6 max-w-4xl text-5xl flex flex-col font-extrabold tracking-tight sm:text-7xl leading-tight"
              initial="hidden"
              animate="visible"
              variants={FADE_UP}
            >
              <span>Screenshot-Proof.</span>
              <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                AI-Resistant CAPTCHA.
              </span>
            </motion.h1>

            <motion.p
              className="mb-10 max-w-2xl text-lg text-neutral-400 sm:text-xl"
              initial="hidden"
              animate="visible"
              variants={FADE_UP}
              transition={{ delay: 0.15 }}
            >
              Noise CAPTCHA uses WebAssembly and dynamic noise rendering to completely mitigate OCR, machine learning vision models, and human-in-the-loop attacks.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4"
              initial="hidden"
              animate="visible"
              variants={FADE_UP}
              transition={{ delay: 0.3 }}
            >
              <Link
                to="/demo"
                className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 hover:scale-105 active:scale-95"
              >
                Try the Demo <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 py-4 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 hover:scale-105 active:scale-95"
              >
                Read the Docs
              </a>
            </motion.div>
          </motion.div>

          <motion.div
            className="order-1 flex justify-center lg:order-2 lg:justify-end"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <div className="drop-shadow-[0_0_34px_rgba(99,102,241,0.45)]">
              <NoiseProofPreview siteKey="nc_pk_844ba90ce0c0eb76ebfe71f3a7336bd6" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="w-full max-w-6xl px-6 py-24">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-white">How it works</h2>
          <p className="mt-4 text-neutral-400">Built from the ground up to prevent automated solving.</p>
        </div>

        <div className="grid gap-8 md:grid-cols-3 text-left">
          <div className="rounded-2xl border border-white/5 bg-white/5 p-8 backdrop-blur-sm">
            <div className="mb-4 inline-flex rounded-lg bg-indigo-500/20 p-3 text-indigo-400">
              <EyeOff className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">Anti-OCR</h3>
            <p className="text-neutral-400">Continuous noise scrolling with exact background matching makes screenshotting or isolating text impossible for ML tools.</p>
          </div>
          
          <div className="rounded-2xl border border-white/5 bg-white/5 p-8 backdrop-blur-sm">
            <div className="mb-4 inline-flex rounded-lg bg-indigo-500/20 p-3 text-indigo-400">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">WebAssembly Core</h3>
            <p className="text-neutral-400">High performance noise generation and pixel manipulation running entirely in WASM, safe from JS tampering.</p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/5 p-8 backdrop-blur-sm">
            <div className="mb-4 inline-flex rounded-lg bg-indigo-500/20 p-3 text-indigo-400">
              <Lock className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">Zero-Knowledge</h3>
            <p className="text-neutral-400">Server verification bounds challenges strictly to origin and time context, using modern cryptographic standards.</p>
          </div>
        </div>
      </section>
    </div>
  );
}