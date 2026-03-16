import { useEffect, useRef, useState } from 'react';
import { Bot, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

declare global {
  interface Window {
    NoiseCaptchaRender?: {
      create: (
        target: HTMLCanvasElement | HTMLElement,
        opts: {
          width: number;
          height: number;
          cellSize: number;
          siteKey: string;
          action?: string;
        }
      ) => Promise<{
        pause: () => void;
        play: () => void;
        toggle: () => boolean;
        refresh: () => void;
        isPaused: () => boolean;
        destroy: () => void;
      }>;
    };
  }
}

const SCRIPT_ID = 'noise-captcha-render-script';
const RENDER_SCRIPT_URL = 'http://192.168.45.24:3000/captcha-render.js';

interface NoiseProofPreviewProps {
  siteKey: string;
}

export default function NoiseProofPreview({ siteKey }: NoiseProofPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<{
    pause: () => void;
    play: () => void;
    toggle: () => boolean;
    refresh: () => void;
    isPaused: () => boolean;
    destroy: () => void;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  const [isHovered, setIsHovered] = useState(false);

  // Auto-toggle functionality
  useEffect(() => {
    if (isHovered || loading || error) return;

    const intervalId = setInterval(() => {
      togglePlayback();
    }, 3000); // 3 seconds auto-toggle

    return () => clearInterval(intervalId);
  }, [isHovered, loading, error, paused]);

  useEffect(() => {
    let cancelled = false;

    const mount = async () => {
      try {
        let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
        if (!script) {
          script = document.createElement('script');
          script.id = SCRIPT_ID;
          script.src = RENDER_SCRIPT_URL;
          script.async = true;
          document.body.appendChild(script);
          await new Promise<void>((resolve, reject) => {
            script!.addEventListener('load', () => resolve(), { once: true });
            script!.addEventListener('error', () => reject(new Error('Failed to load renderer script')), { once: true });
          });
        } else if (!window.NoiseCaptchaRender) {
          await new Promise<void>((resolve, reject) => {
            script!.addEventListener('load', () => resolve(), { once: true });
            script!.addEventListener('error', () => reject(new Error('Failed to load renderer script')), { once: true });
          });
        }

        if (!window.NoiseCaptchaRender || !canvasRef.current) {
          throw new Error('Noise renderer is unavailable');
        }

        const viewportWidth = window.innerWidth;
        const isPhone = viewportWidth < 640;
        const width = isPhone
          ? Math.max(300, Math.min(440, viewportWidth - 24))
          : Math.max(620, Math.min(760, Math.floor(viewportWidth * 0.46)));
        const height = Math.round(width * 0.52);

        const controller = await window.NoiseCaptchaRender.create(canvasRef.current, {
          width,
          height,
          cellSize: 2,
          siteKey,
          action: 'landing-proof'
        });

        if (cancelled) {
          controller.destroy();
          return;
        }

        controllerRef.current = controller;
        setPaused(controller.isPaused());
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to initialize live noise preview');
        setLoading(false);
      }
    };

    mount();

    return () => {
      cancelled = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [siteKey]);

  // Toggle playback handler with safety checks
  const togglePlayback = () => {
    const controller = controllerRef.current;
    if (!controller) return;
    const isPausedNow = controller.toggle();
    setPaused(isPausedNow);
  };

  return (
    <div 
      className="w-full max-w-[760px] cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onPointerDown={() => setIsHovered(true)} // Handle touch devices
    >
      <motion.div 
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-neutral-950"
        whileHover={{ scale: 1.015 }}
        whileTap={{ scale: 0.985 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        onClick={togglePlayback}
      >
        <canvas
          ref={canvasRef}
          className="block w-full bg-neutral-950"
          aria-label="Live CAPTCHA noise proof preview"
        />

        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-neutral-950/70 text-sm text-neutral-300 pointer-events-none">
            Initializing live noise...
          </div>
        )}
      </motion.div>

      <div className="mt-5 flex flex-col items-center justify-center gap-3">
        <motion.button
          type="button"
          role="switch"
          aria-checked={paused}
          onClick={(e) => {
            e.stopPropagation(); // Prevent double triggering if clicking the toggle inside the container
            togglePlayback();
          }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.95 }}
          layout
          className={`
            relative flex h-14 items-center rounded-full border px-2.5
            shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-colors duration-500
            ${paused 
              ? 'border-rose-500/20 bg-rose-950/30 hover:border-rose-500/40 hover:bg-rose-950/40' 
              : 'border-cyan-500/20 bg-cyan-950/30 hover:border-cyan-500/40 hover:bg-cyan-950/40'
            }
          `}
          style={{
            justifyContent: paused ? 'flex-end' : 'flex-start',
          }}
        >
          {/* Flex Container for Inline Text & Icon */}
          <motion.div 
            layout 
            className={`flex w-full items-center gap-2 transition-all duration-300 ${paused ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Moving Icon Thumb */}
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 600, damping: 40 }}
              className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-lg backdrop-blur-sm transition-colors duration-500 ${
                paused 
                  ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)]' 
                  : 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]'
              }`}
            >
              <AnimatePresence mode="wait">
                {paused ? (
                  <motion.div
                    key="robot"
                    initial={{ opacity: 0, scale: 0.2, rotate: -90 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.2, rotate: 90 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <Bot className="h-4 w-4 text-white" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="human"
                    initial={{ opacity: 0, scale: 0.2, rotate: -90 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.2, rotate: 90 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <Eye className="h-4 w-4 text-slate-900" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Inline Typography Container */}
            <div className={`relative flex items-center overflow-hidden transition-all duration-500 ${paused ? 'pl-2.5 pr-0.5' : 'pr-2.5 pl-0.5'}`}>
              <AnimatePresence mode="wait">
                <motion.span
                  key={paused ? 'robot' : 'human'}
                  initial={{ opacity: 0, y: 12, filter: 'blur(8px)', scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }}
                  exit={{ opacity: 0, y: -12, filter: 'blur(8px)', scale: 0.9 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className={`text-[14px] font-extrabold tracking-[0.06em] uppercase whitespace-nowrap ${
                    paused ? 'text-rose-400' : 'text-cyan-400'
                  }`}
                >
                  {paused ? 'Robot View' : 'Human View'}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.button>

        <AnimatePresence mode="wait">
          <motion.p 
            key={paused ? 'robot-desc' : 'human-desc'}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.3 }}
            className="h-8 max-w-[320px] text-center text-[10.5px] leading-relaxed text-neutral-400"
          >
            {paused 
              ? "AI vision models process static frames, seeing only indistinguishable noise."
              : "Humans perceive fluid motion, naturally filtering out the background noise."}
          </motion.p>
        </AnimatePresence>
      </div>

      {error && <p className="mt-2 text-center text-xs text-red-300">{error}</p>}
    </div>
  );
}