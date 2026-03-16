(function () {
  "use strict";

  function resolveServerUrl() {
    const fromCurrentScript = document.currentScript && document.currentScript.src ? document.currentScript.src : "";
    if (fromCurrentScript && /\/captcha-render\.js(\?|#|$)/.test(fromCurrentScript)) {
      return fromCurrentScript.replace(/\/captcha-render\.js(\?|#|$).*/, "/");
    }

    const scripts = document.getElementsByTagName("script");
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src || "";
      if (/\/captcha-render\.js(\?|#|$)/.test(src)) {
        return src.replace(/\/captcha-render\.js(\?|#|$).*/, "/");
      }
    }

    if (typeof window !== "undefined" && window.__NC_SERVER_URL__) {
      return String(window.__NC_SERVER_URL__).replace(/\/+$/, "/") ;
    }

    return "";
  }

  const serverUrl = resolveServerUrl();

  function getServerBaseUrl() {
    if (!serverUrl) {
      throw new Error("NoiseCaptchaRender: cannot resolve server URL");
    }
    return serverUrl.endsWith("/") ? serverUrl : serverUrl + "/";
  }

  function resolveServerPath(path) {
    const base = getServerBaseUrl();
    return new URL(String(path || "").replace(/^\/+/, ""), base).toString();
  }

  let moduleState = {
    loaded: false,
    loading: null,
    CaptchaEngine: null,
  };

  async function loadEngineModule() {
    if (moduleState.loaded && moduleState.CaptchaEngine) {
      return moduleState.CaptchaEngine;
    }
    if (moduleState.loading) {
      return moduleState.loading;
    }

    moduleState.loading = (async () => {
      const engineUrl = resolveServerPath("/engine.js");
      const mod = await import(/* @vite-ignore */ engineUrl);
      if (!mod || typeof mod.default !== "function" || !mod.CaptchaEngine) {
        throw new Error("NoiseCaptchaRender: invalid engine module");
      }
      await mod.default();
      moduleState.CaptchaEngine = mod.CaptchaEngine;
      moduleState.loaded = true;
      return moduleState.CaptchaEngine;
    })();

    return moduleState.loading;
  }

  function decodeBase64ToUint8Array(base64) {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  async function fetchChallenge(options) {
    const url = resolveServerPath("/api/captcha/challenge");
    const body = {
      width: options.width,
      height: options.height,
      cellSize: options.cellSize,
      siteKey: options.siteKey,
      action: options.action || "landing-proof",
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
    });

    if (!res.ok) {
      let reason = "Failed to fetch challenge";
      try {
        const json = await res.json();
        if (json && json.error) reason = json.error;
      } catch {
        // ignore
      }
      throw new Error(`NoiseCaptchaRender: ${reason}`);
    }

    const json = await res.json();
    if (!json || !json.payload) {
      throw new Error("NoiseCaptchaRender: malformed challenge response");
    }
    return json;
  }

  function createController(canvas, engine) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("NoiseCaptchaRender: unable to create 2D context");
    }

    let rafId = 0;
    let destroyed = false;
    let paused = false;
    let lastTime = performance.now();

    function frame(now) {
      if (destroyed || paused) return;
      const delta = Math.min(100, Math.max(0, now - lastTime));
      lastTime = now;
      engine.step(delta);
      engine.render_frame(ctx);
      rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (destroyed || !paused) return;
      paused = false;
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    }

    function stop() {
      paused = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    function toggle() {
      if (paused) {
        start();
      } else {
        stop();
      }
      return paused;
    }

    function destroy() {
      if (destroyed) return;
      stop();
      destroyed = true;
      if (engine && typeof engine.free === "function") {
        engine.free();
      }
    }

    engine.render_frame(ctx);
    rafId = requestAnimationFrame(frame);

    return {
      pause: stop,
      play: start,
      toggle,
      refresh: () => {
        if (typeof engine.regenerate_noise === "function") {
          engine.regenerate_noise();
          engine.render_frame(ctx);
        }
      },
      isPaused: () => paused,
      destroy,
    };
  }

  async function create(target, opts) {
    if (!target) {
      throw new Error("NoiseCaptchaRender: target is required");
    }

    const options = Object.assign(
      {
        width: 560,
        height: 280,
        cellSize: 1,
        siteKey: "",
        action: "landing-proof",
      },
      opts || {}
    );

    if (!options.siteKey) {
      throw new Error("NoiseCaptchaRender: siteKey is required");
    }

    const canvas = target instanceof HTMLCanvasElement ? target : document.createElement("canvas");
    if (!(target instanceof HTMLCanvasElement)) {
      target.innerHTML = "";
      target.appendChild(canvas);
    }
    canvas.width = Math.max(220, Math.min(960, Number(options.width) || 560));
    canvas.height = Math.max(120, Math.min(540, Number(options.height) || 280));
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.display = "block";
    canvas.style.imageRendering = "pixelated";
    canvas.style.imageRendering = "crisp-edges";

    const CaptchaEngine = await loadEngineModule();
    const challenge = await fetchChallenge(options);
    const payload = decodeBase64ToUint8Array(challenge.payload);
    const engine = new CaptchaEngine(canvas.width, canvas.height, Number(options.cellSize) || 1, payload);

    const controller = createController(canvas, engine);

    return {
      canvas,
      challengeId: challenge.challengeId,
      pause: controller.pause,
      play: controller.play,
      toggle: controller.toggle,
      refresh: controller.refresh,
      isPaused: controller.isPaused,
      destroy: controller.destroy,
    };
  }

  window.NoiseCaptchaRender = {
    create,
  };
})();