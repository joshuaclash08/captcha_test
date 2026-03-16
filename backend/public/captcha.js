/**
 * Noise CAPTCHA Embeddable Widget
 * 
 * Drop-in CAPTCHA for third-party sites.
 * Usage: <script src="https://your-captcha-server/captcha.js"></script>
 *        <div data-noise-captcha></div>
 * 
 * API:
 *   window.NoiseCaptcha.getToken(container)  - Get verification token
 *   window.NoiseCaptcha.reset(container)     - Reset CAPTCHA
 *   window.NoiseCaptcha.onVerify(callback)   - Set verification callback
 */
(function() {
  "use strict";

  function resolveServerUrl() {
    const fromCurrentScript = document.currentScript && document.currentScript.src
      ? document.currentScript.src
      : "";

    if (fromCurrentScript && /\/captcha\.js(\?|#|$)/.test(fromCurrentScript)) {
      return fromCurrentScript.replace(/\/captcha\.js.*$/, "");
    }

    const scripts = document.getElementsByTagName("script");
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src || "";
      if (/\/captcha\.js(\?|#|$)/.test(src)) {
        return src.replace(/\/captcha\.js.*$/, "");
      }
    }

    if (typeof window !== "undefined" && window.__NC_SERVER_URL__) {
      return String(window.__NC_SERVER_URL__).replace(/\/$/, "");
    }

    return "";
  }

  const serverUrl = resolveServerUrl();

  function getServerBaseUrl() {
    if (!serverUrl) return "";
    return serverUrl.endsWith("/") ? serverUrl : serverUrl + "/";
  }

  function resolveServerPath(path) {
    const base = getServerBaseUrl();
    if (!base) return "";
    return new URL(String(path || "").replace(/^\/+/, ""), base).toString();
  }

  // State management per container
  const instances = new Map();
  let globalOnVerify = null;

  // WASM module state
  let wasmModule = null;
  let wasmInit = null;
  let wasmLoading = false;
  let wasmLoadPromise = null;

  // Widget states
  const STATE = {
    IDLE: "idle",
    LOADING: "loading",
    ACTIVE: "active",
    VERIFYING: "verifying",
    VERIFIED: "verified",
    ERROR: "error"
  };

  // i18n: Default messages (can be overridden via data-lang attribute)
  const LANG = {
    en: {
      notARobot: "I'm not a robot",
      enterCode: "Enter code",
      verify: "Verify",
      verified: "Verified",
      loading: "Loading challenge...",
      clickToEnlarge: "Click to enlarge",
      enterTheCode: "Enter the code you see",
      pressEscToClose: "Press ESC or click outside to close",
      newChallenge: "Get new challenge",
      enlarge: "Enlarge",
      pleaseEnterCode: "Please enter the code",
      failedToLoad: "Failed to load CAPTCHA",
      retry: "Retry",
      verificationFailed: "Verification failed. Please try again.",
      tryAgainNewChallenge: "Please try again with a new challenge",
      incorrectCode: "Incorrect code",
      attemptsRemaining: "{n} attempt{s} remaining",
      accessibilityLabel: "CAPTCHA verification - click checkbox to start challenge",
      canvasLabel: "CAPTCHA challenge image with animated noise pattern",
    },
    ko: {
      notARobot: "로봇이 아닙니다",
      enterCode: "코드 입력",
      verify: "확인",
      verified: "인증 완료",
      loading: "챌린지 로딩 중...",
      clickToEnlarge: "클릭하여 확대",
      enterTheCode: "보이는 코드를 입력하세요",
      pressEscToClose: "ESC를 누르거나 바깥을 클릭하여 닫기",
      newChallenge: "새 챌린지 받기",
      enlarge: "확대",
      pleaseEnterCode: "코드를 입력하세요",
      failedToLoad: "CAPTCHA 로드 실패",
      retry: "재시도",
      verificationFailed: "인증에 실패했습니다. 다시 시도하세요.",
      tryAgainNewChallenge: "새 챌린지로 다시 시도하세요",
      incorrectCode: "잘못된 코드입니다",
      attemptsRemaining: "{n}회 시도 남음",
      accessibilityLabel: "CAPTCHA 인증 - 체크박스를 클릭하여 챌린지 시작",
      canvasLabel: "애니메이션 노이즈 패턴이 있는 CAPTCHA 챌린지 이미지",
    },
    ja: {
      notARobot: "私はロボットではありません",
      enterCode: "コードを入力",
      verify: "確認",
      verified: "認証済み",
      loading: "チャレンジを読み込み中...",
      clickToEnlarge: "クリックして拡大",
      enterTheCode: "表示されたコードを入力してください",
      pressEscToClose: "ESCキーまたは外側をクリックして閉じる",
      newChallenge: "新しいチャレンジを取得",
      enlarge: "拡大",
      pleaseEnterCode: "コードを入力してください",
      failedToLoad: "CAPTCHAの読み込みに失敗しました",
      retry: "再試行",
      verificationFailed: "認証に失敗しました。もう一度お試しください。",
      tryAgainNewChallenge: "新しいチャレンジでもう一度お試しください",
      incorrectCode: "コードが正しくありません",
      attemptsRemaining: "残り{n}回",
      accessibilityLabel: "CAPTCHA認証 - チェックボックスをクリックしてチャレンジを開始",
      canvasLabel: "アニメーションノイズパターンのCAPTCHAチャレンジ画像",
    }
  };

  function getLang(container) {
    var langAttr = container.getAttribute("data-lang") || navigator.language || "en";
    var langCode = langAttr.split("-")[0].toLowerCase();
    return LANG[langCode] || LANG.en;
  }

  // Inject styles with Apple-inspired, Tailwind-like design
  function injectStyles() {
    if (document.getElementById("noise-captcha-styles")) return;
    
    const style = document.createElement("style");
    style.id = "noise-captcha-styles";
    style.textContent = `
      .nc-container {
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 14px;
        max-width: 340px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 16px;
        background: linear-gradient(to bottom, #ffffff, #fafafa);
        padding: 16px;
        box-sizing: border-box;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.03);
        transition: box-shadow 0.2s ease, border-color 0.2s ease;
      }
      .nc-container:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.06);
      }
      .nc-container * { box-sizing: border-box; }
      
      /* Checkbox row */
      .nc-checkbox-row {
        display: flex;
        align-items: center;
        gap: 14px;
        cursor: pointer;
        user-select: none;
        padding: 2px 4px;
        margin: -2px -4px;
        border-radius: 10px;
        transition: background 0.15s ease;
      }
      .nc-checkbox-row:hover { background: rgba(0, 0, 0, 0.02); }
      .nc-checkbox-row:active { background: rgba(0, 0, 0, 0.04); }
      
      .nc-checkbox {
        width: 26px;
        height: 26px;
        border: 2px solid #d1d5db;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #fff;
        flex-shrink: 0;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .nc-checkbox-row:hover .nc-checkbox {
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
      .nc-checkbox.nc-loading {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.05);
      }
      .nc-checkbox.nc-verified {
        background: linear-gradient(135deg, #10b981, #059669);
        border-color: transparent;
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
      }
      .nc-checkbox.nc-error {
        border-color: #ef4444;
        background: rgba(239, 68, 68, 0.05);
      }
      
      /* Spinner */
      .nc-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #3b82f6;
        border-top-color: transparent;
        border-radius: 50%;
        animation: nc-spin 0.7s linear infinite;
      }
      @keyframes nc-spin {
        to { transform: rotate(360deg); }
      }
      
      .nc-checkmark {
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        line-height: 1;
      }
      
      .nc-label {
        color: #374151;
        font-weight: 500;
        flex-grow: 1;
        font-size: 15px;
        letter-spacing: -0.01em;
      }
      
      .nc-brand {
        display: none;
      }
      
      /* Header buttons - only visible when expanded */
      .nc-header-buttons {
        display: flex;
        gap: 6px;
        margin-left: auto;
        opacity: 0;
        visibility: hidden;
        transform: scale(0.9);
        transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.2s ease;
      }
      .nc-header-buttons.nc-visible {
        opacity: 1;
        visibility: visible;
        transform: scale(1);
      }
      
      .nc-header-btn {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f3f4f6;
        border: none;
        border-radius: 7px;
        cursor: pointer;
        color: #6b7280;
        transition: all 0.15s ease;
      }
      .nc-header-btn:hover {
        background: #e5e7eb;
        color: #374151;
      }
      .nc-header-btn:active {
        transform: scale(0.95);
      }
      .nc-header-btn svg {
        width: 14px;
        height: 14px;
      }
      
      /* Challenge section */
      .nc-challenge {
        margin-top: 0;
        padding-top: 0;
        overflow: hidden;
        max-height: 0;
        opacity: 0;
        transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), 
                    opacity 0.25s ease,
                    margin-top 0.35s ease,
                    padding-top 0.35s ease;
      }
      .nc-challenge.nc-expanded {
        margin-top: 12px;
        padding-top: 0;
        max-height: 280px;
        opacity: 1;
      }
      
      /* Canvas wrapper */
      .nc-canvas-wrapper {
        background: linear-gradient(135deg, #1f2937, #111827);
        border-radius: 12px;
        overflow: hidden;
        margin-bottom: 12px;
        position: relative;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .nc-canvas-wrapper:hover {
        transform: scale(1.01);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
      .nc-canvas-wrapper:active {
        transform: scale(0.99);
      }
      
      .nc-canvas {
        display: block;
        width: 100%;
        height: auto;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }
      
      /* Expand hint overlay */
      .nc-expand-hint {
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        color: #fff;
        font-size: 11px;
        font-weight: 500;
        padding: 4px 8px;
        border-radius: 6px;
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
      }
      .nc-canvas-wrapper:hover .nc-expand-hint {
        opacity: 1;
      }
      
      /* Toolbar row - hidden since buttons are now in header */
      .nc-toolbar {
        display: none;
      }
      
      .nc-icon-btn {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f3f4f6;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        color: #6b7280;
        transition: all 0.15s ease;
      }
      .nc-icon-btn:hover {
        background: #e5e7eb;
        color: #374151;
      }
      .nc-icon-btn:active {
        transform: scale(0.95);
      }
      .nc-icon-btn svg {
        width: 16px;
        height: 16px;
      }
      
      /* Input row */
      .nc-input-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      
      .nc-input {
        flex: 1;
        min-width: 0;
        padding: 12px 14px;
        border: 1.5px solid #e5e7eb;
        border-radius: 10px;
        font-size: 16px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 3px;
        text-align: center;
        outline: none;
        background: #fff;
        color: #1f2937;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .nc-input::placeholder {
        color: #9ca3af;
        letter-spacing: 1px;
        text-transform: none;
        font-weight: 400;
      }
      .nc-input:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
      }
      
      .nc-btn {
        padding: 12px 20px;
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: #fff;
        border: none;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
        white-space: nowrap;
      }
      .nc-btn:hover {
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        transform: translateY(-1px);
      }
      .nc-btn:active {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(37, 99, 235, 0.2);
      }
      .nc-btn:disabled {
        background: #d1d5db;
        cursor: not-allowed;
        box-shadow: none;
        transform: none;
      }
      
      /* Status messages */
      .nc-error-msg {
        color: #dc2626;
        font-size: 13px;
        font-weight: 500;
        margin-top: 10px;
        padding: 8px 12px;
        background: rgba(220, 38, 38, 0.08);
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .nc-error-msg::before {
        content: "!";
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        background: #dc2626;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        border-radius: 50%;
        flex-shrink: 0;
      }
      
      .nc-attempts-msg {
        color: #f59e0b;
        font-size: 12px;
        font-weight: 500;
        margin-top: 6px;
        text-align: center;
      }
      
      .nc-success-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 10px;
        color: #059669;
        font-size: 14px;
        font-weight: 500;
      }
      
      /* ========================================
         Modal/Popup for enlarged CAPTCHA
         ======================================== */
      .nc-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.25s ease, visibility 0.25s ease;
      }
      .nc-modal-overlay.nc-modal-open {
        opacity: 1;
        visibility: visible;
      }
      
      .nc-modal {
        background: #fff;
        border-radius: 20px;
        padding: 24px;
        max-width: 90vw;
        max-height: 90vh;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
        transform: scale(0.95) translateY(10px);
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        overflow: auto;
      }
      .nc-modal-overlay.nc-modal-open .nc-modal {
        transform: scale(1) translateY(0);
      }
      
      .nc-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      
      .nc-modal-title {
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
        margin: 0;
      }
      
      .nc-modal-close {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f3f4f6;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        color: #6b7280;
        font-size: 18px;
        transition: all 0.15s ease;
      }
      .nc-modal-close:hover {
        background: #e5e7eb;
        color: #374151;
      }
      
      .nc-modal-canvas-wrapper {
        background: linear-gradient(135deg, #1f2937, #111827);
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .nc-modal-canvas {
        display: block;
        max-width: 100%;
        height: auto;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }
      
      .nc-modal-hint {
        text-align: center;
        margin-top: 12px;
        color: #6b7280;
        font-size: 13px;
      }
      
      /* Modal input row */
      .nc-modal-input-row {
        display: flex;
        gap: 10px;
        margin-top: 16px;
      }
      
      .nc-modal-input {
        flex: 1;
        padding: 14px 16px;
        border: 1.5px solid #e5e7eb;
        border-radius: 10px;
        font-size: 18px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 4px;
        text-align: center;
        outline: none;
        background: #fff;
        color: #1f2937;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .nc-modal-input::placeholder {
        color: #9ca3af;
        letter-spacing: 1px;
        text-transform: none;
        font-weight: 400;
      }
      .nc-modal-input:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
      }
      
      .nc-modal-btn {
        padding: 14px 24px;
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: #fff;
        border: none;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
      }
      .nc-modal-btn:hover {
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        transform: translateY(-1px);
      }
      .nc-modal-btn:active {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(37, 99, 235, 0.2);
      }
      .nc-modal-btn:disabled {
        background: #d1d5db;
        cursor: not-allowed;
        box-shadow: none;
        transform: none;
      }
      
      .nc-modal-error {
        color: #dc2626;
        font-size: 13px;
        font-weight: 500;
        margin-top: 10px;
        padding: 8px 12px;
        background: rgba(220, 38, 38, 0.08);
        border-radius: 8px;
        text-align: center;
        display: none;
      }
      
      .nc-modal-attempts {
        color: #f59e0b;
        font-size: 12px;
        font-weight: 500;
        margin-top: 6px;
        text-align: center;
        display: none;
      }
      
      /* Mobile responsive */
      @media (max-width: 480px) {
        .nc-modal {
          padding: 16px;
          max-width: 95vw;
        }
        .nc-modal-input-row {
          flex-direction: column;
          gap: 8px;
        }
        .nc-modal-input {
          width: 100%;
          font-size: 16px;
          letter-spacing: 2px;
          padding: 12px 14px;
        }
        .nc-modal-btn {
          width: 100%;
          padding: 12px 16px;
        }
      }
      
      /* ========================================
         Dark Theme
         ======================================== */
      .nc-container.nc-dark {
        background: linear-gradient(to bottom, #1f2937, #111827);
        border-color: rgba(255, 255, 255, 0.1);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .nc-container.nc-dark:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3);
      }
      
      .nc-container.nc-dark .nc-checkbox-row:hover { background: rgba(255, 255, 255, 0.05); }
      .nc-container.nc-dark .nc-checkbox-row:active { background: rgba(255, 255, 255, 0.08); }
      
      .nc-container.nc-dark .nc-checkbox {
        background: #374151;
        border-color: #4b5563;
      }
      .nc-container.nc-dark .nc-checkbox-row:hover .nc-checkbox {
        border-color: #60a5fa;
        box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
      }
      .nc-container.nc-dark .nc-checkbox.nc-loading {
        border-color: #60a5fa;
        background: rgba(96, 165, 250, 0.1);
      }
      
      .nc-container.nc-dark .nc-label {
        color: #e5e7eb;
      }
      
      .nc-container.nc-dark .nc-header-btn {
        background: #374151;
        color: #9ca3af;
      }
      .nc-container.nc-dark .nc-header-btn:hover {
        background: #4b5563;
        color: #e5e7eb;
      }
      
      .nc-container.nc-dark .nc-input {
        background: #374151;
        border-color: #4b5563;
        color: #f3f4f6;
      }
      .nc-container.nc-dark .nc-input::placeholder {
        color: #6b7280;
      }
      .nc-container.nc-dark .nc-input:focus {
        border-color: #60a5fa;
        box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
      }
      
      .nc-container.nc-dark .nc-icon-btn {
        background: #374151;
        color: #9ca3af;
      }
      .nc-container.nc-dark .nc-icon-btn:hover {
        background: #4b5563;
        color: #e5e7eb;
      }
      
      .nc-container.nc-dark .nc-error-msg {
        background: rgba(239, 68, 68, 0.15);
        color: #fca5a5;
      }
      
      .nc-container.nc-dark .nc-attempts-msg {
        color: #fbbf24;
      }
      
      .nc-container.nc-dark .nc-success-row {
        color: #34d399;
      }
      
      /* Dark Modal */
      .nc-modal-dark .nc-modal {
        background: #1f2937;
      }
      
      .nc-modal-dark .nc-modal-title {
        color: #f3f4f6;
      }
      
      .nc-modal-dark .nc-modal-close {
        background: #374151;
        color: #9ca3af;
      }
      .nc-modal-dark .nc-modal-close:hover {
        background: #4b5563;
        color: #e5e7eb;
      }
      
      .nc-modal-dark .nc-modal-input {
        background: #374151;
        border-color: #4b5563;
        color: #f3f4f6;
      }
      .nc-modal-dark .nc-modal-input::placeholder {
        color: #6b7280;
      }
      .nc-modal-dark .nc-modal-input:focus {
        border-color: #60a5fa;
        box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
      }
      
      .nc-modal-dark .nc-modal-hint {
        color: #9ca3af;
      }
      
      .nc-modal-dark .nc-modal-error {
        background: rgba(239, 68, 68, 0.15);
        color: #fca5a5;
      }
      
      .nc-modal-dark .nc-modal-attempts {
        color: #fbbf24;
      }
    `;
    document.head.appendChild(style);
  }

  // Load WASM module dynamically
  async function loadWasm() {
    if (wasmModule) return wasmModule;
    if (wasmLoadPromise) return wasmLoadPromise;

    wasmLoading = true;
    wasmLoadPromise = (async () => {
      if (!serverUrl) {
        throw new Error("CAPTCHA server URL could not be resolved. Ensure captcha.js is loaded from a full URL or set window.__NC_SERVER_URL__.");
      }
      const wasmUrl = resolveServerPath("engine.js");
      const module = await import(wasmUrl);
      await module.default();
      wasmModule = module;
      wasmLoading = false;
      return module;
    })();

    return wasmLoadPromise;
  }

  // SVG Icons
  const ICONS = {
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
    close: '×'
  };

  // Create widget DOM
  function createWidgetDOM(container) {
    container.innerHTML = "";
    container.classList.add("nc-container");
    
    var lang = getLang(container);
    
    // Apply dark theme if specified
    var theme = container.getAttribute("data-theme");
    if (theme === "dark") {
      container.classList.add("nc-dark");
    }
    
    // Accessibility: ARIA attributes on container
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", lang.accessibilityLabel);

    const checkboxRow = document.createElement("div");
    checkboxRow.className = "nc-checkbox-row";
    checkboxRow.setAttribute("role", "checkbox");
    checkboxRow.setAttribute("aria-checked", "false");
    checkboxRow.setAttribute("tabindex", "0");
    checkboxRow.setAttribute("aria-label", lang.notARobot);
    checkboxRow.innerHTML = '<div class="nc-checkbox"></div><span class="nc-label">' + lang.notARobot + '</span><div class="nc-header-buttons"><button class="nc-header-btn nc-header-refresh-btn" title="' + lang.newChallenge + '" type="button" aria-label="' + lang.newChallenge + '">' + ICONS.refresh + '</button><button class="nc-header-btn nc-header-expand-btn" title="' + lang.enlarge + '" type="button" aria-label="' + lang.enlarge + '">' + ICONS.expand + '</button></div>';

    const challenge = document.createElement("div");
    challenge.className = "nc-challenge";
    challenge.innerHTML = '<div class="nc-toolbar"><button class="nc-icon-btn nc-refresh-btn" title="' + lang.newChallenge + '" type="button" aria-label="' + lang.newChallenge + '">' + ICONS.refresh + '</button><button class="nc-icon-btn nc-expand-btn" title="' + lang.enlarge + '" type="button" aria-label="' + lang.enlarge + '">' + ICONS.expand + '</button></div><div class="nc-canvas-wrapper"><canvas class="nc-canvas" role="img" aria-label="' + lang.canvasLabel + '"></canvas><div class="nc-expand-hint">' + lang.clickToEnlarge + '</div></div><div class="nc-input-row"><input class="nc-input" type="text" maxlength="6" placeholder="' + lang.enterCode + '" autocomplete="off" spellcheck="false" aria-label="' + lang.enterCode + '" /><button class="nc-btn" type="button">' + lang.verify + '</button></div><div class="nc-attempts-msg" style="display:none;" role="alert" aria-live="polite"></div><div class="nc-error-msg" style="display:none;" role="alert" aria-live="assertive"></div>';

    container.appendChild(checkboxRow);
    container.appendChild(challenge);

    // Create modal (append to body)
    let modal = document.getElementById("nc-modal-overlay");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "nc-modal-overlay";
      modal.className = "nc-modal-overlay";
      
      // Apply dark theme to modal if specified
      var theme = container.getAttribute("data-theme");
      if (theme === "dark") {
        modal.classList.add("nc-modal-dark");
      }
      modal.innerHTML = '<div class="nc-modal" role="dialog" aria-modal="true" aria-label="' + lang.enterTheCode + '"><div class="nc-modal-header"><h3 class="nc-modal-title">' + lang.enterTheCode + '</h3><button class="nc-modal-close" type="button" aria-label="Close">' + ICONS.close + '</button></div><div class="nc-modal-canvas-wrapper"><canvas class="nc-modal-canvas" role="img" aria-label="' + lang.canvasLabel + '"></canvas></div><div class="nc-modal-input-row"><input class="nc-modal-input" type="text" maxlength="6" placeholder="' + lang.enterCode + '" autocomplete="off" spellcheck="false" aria-label="' + lang.enterCode + '" /><button class="nc-modal-btn" type="button">' + lang.verify + '</button></div><div class="nc-modal-error" role="alert" aria-live="assertive"></div><div class="nc-modal-attempts" role="alert" aria-live="polite"></div><div class="nc-modal-hint">' + lang.pressEscToClose + '</div></div>';
      document.body.appendChild(modal);

      // Close modal handlers
      modal.addEventListener("click", function(e) {
        if (e.target === modal) closeModal();
      });
      modal.querySelector(".nc-modal-close").addEventListener("click", closeModal);
      document.addEventListener("keydown", function(e) {
        if (e.key === "Escape") closeModal();
      });
    }

    return {
      checkboxRow: checkboxRow,
      checkbox: checkboxRow.querySelector(".nc-checkbox"),
      challenge: challenge,
      canvas: challenge.querySelector(".nc-canvas"),
      canvasWrapper: challenge.querySelector(".nc-canvas-wrapper"),
      input: challenge.querySelector(".nc-input"),
      button: challenge.querySelector(".nc-btn"),
      refreshBtn: challenge.querySelector(".nc-refresh-btn"),
      expandBtn: challenge.querySelector(".nc-expand-btn"),
      errorMsg: challenge.querySelector(".nc-error-msg"),
      attemptsMsg: challenge.querySelector(".nc-attempts-msg"),
      headerButtons: checkboxRow.querySelector(".nc-header-buttons"),
      headerRefreshBtn: checkboxRow.querySelector(".nc-header-refresh-btn"),
      headerExpandBtn: checkboxRow.querySelector(".nc-header-expand-btn"),
      modal: modal,
      modalCanvas: modal.querySelector(".nc-modal-canvas"),
      modalInput: modal.querySelector(".nc-modal-input"),
      modalBtn: modal.querySelector(".nc-modal-btn"),
      modalError: modal.querySelector(".nc-modal-error"),
      modalAttempts: modal.querySelector(".nc-modal-attempts")
    };
  }

  // Modal state
  var activeModalInstance = null;
  var modalAnimFrameId = null;

  function openModal(instance) {
    var modal = instance.elements.modal;
    var modalCanvas = instance.elements.modalCanvas;
    var canvas = instance.elements.canvas;
    activeModalInstance = instance;
    
    // Set modal canvas size (2x for better readability)
    var scale = 2;
    modalCanvas.width = canvas.width * scale;
    modalCanvas.height = canvas.height * scale;
    modalCanvas.style.width = (canvas.width * scale) + "px";
    modalCanvas.style.height = (canvas.height * scale) + "px";
    
    modal.classList.add("nc-modal-open");
    
    // Sync and focus modal input
    instance.elements.modalInput.value = instance.elements.input.value;
    setTimeout(function() { instance.elements.modalInput.focus(); }, 100);
    
    // Start rendering to modal canvas
    var ctx = modalCanvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = false;
    
    function renderModalLoop(ts) {
      if (!activeModalInstance || !modal.classList.contains("nc-modal-open")) return;
      
      // Render to main canvas normally
      if (instance.engine && instance.state === STATE.ACTIVE) {
        var delta = instance.lastTs === 0 ? 0 : ts - instance.lastTs;
        instance.engine.step(delta);
        
        // Get the main canvas context
        var mainCtx = canvas.getContext("2d", { alpha: false });
        instance.engine.render_frame(mainCtx);
        instance.lastTs = ts;
        
        // Scale up to modal canvas
        ctx.drawImage(canvas, 0, 0, modalCanvas.width, modalCanvas.height);
      }
      
      modalAnimFrameId = requestAnimationFrame(renderModalLoop);
    }
    
    renderModalLoop(performance.now());
  }

  function closeModal() {
    var modal = document.getElementById("nc-modal-overlay");
    if (modal) {
      modal.classList.remove("nc-modal-open");
    }
    if (modalAnimFrameId) {
      cancelAnimationFrame(modalAnimFrameId);
      modalAnimFrameId = null;
    }
    activeModalInstance = null;
  }

  // Initialize a single CAPTCHA instance
  async function initInstance(container) {
    var elements = createWidgetDOM(container);
    
    // Read site key from data attribute
    var siteKey = container.getAttribute("data-sitekey") || "";
    var action = container.getAttribute("data-action") || "";
    
    if (!siteKey) {
      console.error("NoiseCAPTCHA: Missing data-sitekey attribute");
    }
    
    var instance = {
      container: container,
      elements: elements,
      state: STATE.IDLE,
      engine: null,
      challengeId: null,
      token: null,
      animFrameId: null,
      lastTs: 0,
      attemptsRemaining: null,
      siteKey: siteKey,
      action: action,
      lang: getLang(container)
    };
    
    instances.set(container, instance);

    // Checkbox click handler
    elements.checkboxRow.addEventListener("click", function() {
      handleCheckboxClick(instance);
    });
    
    // Keyboard accessibility: Enter/Space on checkbox
    elements.checkboxRow.addEventListener("keydown", function(e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleCheckboxClick(instance);
      }
    });
    
    // Input enter key
    elements.input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleVerify(instance);
      }
    });
    
    // Verify button
    elements.button.addEventListener("click", function() {
      handleVerify(instance);
    });
    
    // Refresh button
    elements.refreshBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      handleRefresh(instance);
    });
    
    // Expand button
    elements.expandBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      openModal(instance);
    });
    
    // Header refresh button
    elements.headerRefreshBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      handleRefresh(instance);
    });
    
    // Header expand button
    elements.headerExpandBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      openModal(instance);
    });
    
    // Canvas wrapper click to expand
    elements.canvasWrapper.addEventListener("click", function() {
      openModal(instance);
    });
    
    // Modal input enter key
    elements.modalInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleVerify(instance, true);
      }
    });
    
    // Modal verify button
    elements.modalBtn.addEventListener("click", function() {
      handleVerify(instance, true);
    });
    
    // Sync inputs: main -> modal
    elements.input.addEventListener("input", function() {
      elements.modalInput.value = elements.input.value;
    });
    
    // Sync inputs: modal -> main
    elements.modalInput.addEventListener("input", function() {
      elements.input.value = elements.modalInput.value;
    });

    return instance;
  }

  // Handle refresh
  async function handleRefresh(instance) {
    if (instance.state === STATE.LOADING) return;
    
    // Stop current animation
    if (instance.animFrameId) {
      cancelAnimationFrame(instance.animFrameId);
      instance.animFrameId = null;
    }
    
    // Reset state
    instance.elements.input.value = "";
    instance.elements.modalInput.value = "";
    instance.elements.button.disabled = false;
    instance.elements.modalBtn.disabled = false;
    hideError(instance);
    hideAttempts(instance);
    hideModalError(instance);
    hideModalAttempts(instance);
    instance.attemptsRemaining = null;
    
    // Load new challenge
    setState(instance, STATE.LOADING);
    await loadChallenge(instance);
  }

  // Handle checkbox click
  async function handleCheckboxClick(instance) {
    if (instance.state === STATE.VERIFIED) return;
    if (instance.state === STATE.LOADING || instance.state === STATE.ACTIVE) return;

    setState(instance, STATE.LOADING);
    await loadChallenge(instance);
  }

  // Load challenge
  async function loadChallenge(instance) {
    try {
      // Load WASM
      await loadWasm();
      
      // Build request body with site key and action
      var requestBody = {
        siteKey: instance.siteKey
      };
      if (instance.action) {
        requestBody.action = instance.action;
      }
      
      // Fetch challenge
      var res = await fetch(resolveServerPath("api/captcha/challenge"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      
      if (res.status === 429) {
        throw new Error("Rate limited. Please wait.");
      }

      if (!res.ok) {
        var errorData = await res.json().catch(function() { return {}; });
        throw new Error(errorData.error || "Challenge request failed");
      }
      
      var challenge = await res.json();
      
      instance.challengeId = challenge.challengeId;
      instance.attemptsRemaining = null;

      // Set canvas size
      var canvas = instance.elements.canvas;
      canvas.width = challenge.width;
      canvas.height = challenge.height;

      // Decode payload (contains encrypted glyph + noiseConfig)
      var raw = atob(challenge.payload);
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

      // Create engine (WASM decrypts and extracts all config from payload)
      if (instance.engine) {
        try { instance.engine.free(); } catch (_) {}
      }
      instance.engine = new wasmModule.CaptchaEngine(
        challenge.width,
        challenge.height,
        challenge.cellSize,
        bytes
      );

      // Start render loop
      var ctx = canvas.getContext("2d", { alpha: false });
      ctx.imageSmoothingEnabled = false;
      
      function renderLoop(ts) {
        if (instance.state === STATE.ACTIVE || instance.state === STATE.VERIFYING) {
          var delta = instance.lastTs === 0 ? 0 : ts - instance.lastTs;
          instance.engine.step(delta);
          instance.engine.render_frame(ctx);
          instance.lastTs = ts;
          instance.animFrameId = requestAnimationFrame(renderLoop);
        }
      }
      
      setState(instance, STATE.ACTIVE);
      instance.lastTs = 0;
      renderLoop(performance.now());

      // Focus input
      setTimeout(function() { instance.elements.input.focus(); }, 100);

    } catch (err) {
      console.error("CAPTCHA init error:", err);
      setState(instance, STATE.ERROR);
      showError(instance, instance.lang.failedToLoad);
      // Add retry button
      var retryBtn = document.createElement("button");
      retryBtn.textContent = instance.lang.retry;
      retryBtn.setAttribute("aria-label", instance.lang.retry);
      retryBtn.style.cssText = "margin-top:8px;padding:6px 16px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;";
      retryBtn.onclick = function() { handleRefresh(instance); };
      var errorEl = instance.elements.modal.querySelector(".nc-error");
      if (errorEl) errorEl.appendChild(retryBtn);
    }
  }

  // Handle verification
  async function handleVerify(instance, fromModal) {
    if (instance.state !== STATE.ACTIVE) return;
    
    // Get answer from appropriate input (they are synced but use source)
    var answer = fromModal 
      ? instance.elements.modalInput.value.trim() 
      : instance.elements.input.value.trim();
    
    if (!answer) {
      if (fromModal) {
        showModalError(instance, instance.lang.pleaseEnterCode);
      } else {
        showError(instance, instance.lang.pleaseEnterCode);
      }
      return;
    }

    setState(instance, STATE.VERIFYING);
    instance.elements.button.disabled = true;
    instance.elements.modalBtn.disabled = true;
    hideError(instance);
    hideAttempts(instance);
    hideModalError(instance);
    hideModalAttempts(instance);

    try {
      var res = await fetch(resolveServerPath("api/captcha/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: instance.challengeId,
          answer: answer
        })
      });
      var result = await res.json();

      if (res.status === 429) {
        throw new Error("Rate limited. Please wait.");
      }

      if (result.success) {
        instance.token = result.token;
        setState(instance, STATE.VERIFIED);
        
        setTimeout(() => {
          closeModal();
          if (instance.animFrameId) {
            cancelAnimationFrame(instance.animFrameId);
            instance.animFrameId = null;
          }
          if (globalOnVerify) {
            globalOnVerify(instance.token, instance.container);
          }
        }, 800);
      } else {
        instance.elements.button.disabled = false;
        instance.elements.modalBtn.disabled = false;
        instance.elements.input.value = "";
        instance.elements.modalInput.value = "";
        
        var isInvalidState = result["error-codes"] && (
          result["error-codes"].includes("invalid-or-expired-challenge") ||
          result["error-codes"].includes("missing-challenge-id") ||
          result["error-codes"].includes("rate-limited")
        );

        if (result.needNewChallenge || isInvalidState) {
          var errMsg = result.error || instance.lang.tryAgainNewChallenge;
          showError(instance, errMsg);
          showModalError(instance, errMsg);
          instance.challengeId = null;
          
          setTimeout(function() {
            if (instance.state !== STATE.VERIFIED) {
              closeModal();
              handleRefresh(instance);
            }
          }, 1500);
        } else {
          instance.attemptsRemaining = result.attemptsRemaining != null ? result.attemptsRemaining : null;
          setState(instance, STATE.ACTIVE);
          var errMsg = result.error || instance.lang.incorrectCode;
          showError(instance, errMsg);
          showModalError(instance, errMsg);
          
          if (instance.attemptsRemaining != null) {
            var attMsg = instance.lang.attemptsRemaining
              .replace("{n}", instance.attemptsRemaining)
              .replace("{s}", instance.attemptsRemaining > 1 ? "s" : "");
            showAttempts(instance, attMsg);
            showModalAttempts(instance, attMsg);
          }
          
          if (fromModal) {
            instance.elements.modalInput.focus();
          } else {
            instance.elements.input.focus();
          }
        }
      }
    } catch (err) {
      console.error("Verify error:", err);
      setState(instance, STATE.ACTIVE);
      instance.elements.button.disabled = false;
      instance.elements.modalBtn.disabled = false;
      var errMsg = err.message || instance.lang.verificationFailed;
      showError(instance, errMsg);
      showModalError(instance, errMsg);
    }
  }

  // State management
  function setState(instance, state) {
    instance.state = state;
    var checkbox = instance.elements.checkbox;
    var challenge = instance.elements.challenge;
    var headerButtons = instance.elements.headerButtons;
    
    // Reset checkbox classes
    checkbox.classList.remove("nc-loading", "nc-verified", "nc-error");
    checkbox.innerHTML = "";
    
    switch (state) {
      case STATE.IDLE:
        challenge.classList.remove("nc-expanded");
        headerButtons.classList.remove("nc-visible");
        break;
        
      case STATE.LOADING:
        checkbox.classList.add("nc-loading");
        checkbox.innerHTML = '<div class="nc-spinner"></div>';
        challenge.classList.remove("nc-expanded");
        headerButtons.classList.remove("nc-visible");
        break;
        
      case STATE.ACTIVE:
      case STATE.VERIFYING:
        challenge.classList.add("nc-expanded");
        headerButtons.classList.add("nc-visible");
        break;
        
      case STATE.VERIFIED:
        checkbox.classList.add("nc-verified");
        checkbox.innerHTML = '<span class="nc-checkmark">✓</span>';
        challenge.classList.remove("nc-expanded");
        headerButtons.classList.remove("nc-visible");
        break;
        
      case STATE.ERROR:
        checkbox.classList.add("nc-error");
        headerButtons.classList.remove("nc-visible");
        break;
    }
  }

  function showError(instance, msg) {
    var el = instance.elements.errorMsg;
    el.textContent = msg;
    el.style.display = "flex";
  }

  function hideError(instance) {
    instance.elements.errorMsg.style.display = "none";
  }

  function showAttempts(instance, msg) {
    var el = instance.elements.attemptsMsg;
    el.textContent = msg;
    el.style.display = "block";
  }

  function hideAttempts(instance) {
    instance.elements.attemptsMsg.style.display = "none";
  }

  function showModalError(instance, msg) {
    var el = instance.elements.modalError;
    el.textContent = msg;
    el.style.display = "block";
  }

  function hideModalError(instance) {
    instance.elements.modalError.style.display = "none";
  }

  function showModalAttempts(instance, msg) {
    var el = instance.elements.modalAttempts;
    el.textContent = msg;
    el.style.display = "block";
  }

  function hideModalAttempts(instance) {
    instance.elements.modalAttempts.style.display = "none";
  }

  // Public API
  window.NoiseCaptcha = {
    render: function(container) {
      if (typeof container === "string") {
        container = document.querySelector(container);
      }
      if (!container) {
        console.error("NoiseCaptcha: Container not found");
        return;
      }
      injectStyles();
      initInstance(container);
    },

    getToken: function(container) {
      if (typeof container === "string") {
        container = document.querySelector(container);
      }
      var instance = instances.get(container);
      return instance ? instance.token : null;
    },

    reset: function(container) {
      if (typeof container === "string") {
        container = document.querySelector(container);
      }
      var instance = instances.get(container);
      if (instance) {
        if (instance.animFrameId) {
          cancelAnimationFrame(instance.animFrameId);
        }
        if (instance.engine) {
          try { instance.engine.free(); } catch (_) {}
        }
        instance.engine = null;
        instance.challengeId = null;
        instance.token = null;
        instance.attemptsRemaining = null;
        instance.elements.input.value = "";
        instance.elements.modalInput.value = "";
        instance.elements.button.disabled = false;
        instance.elements.modalBtn.disabled = false;
        hideError(instance);
        hideModalError(instance);
        hideAttempts(instance);
        hideModalAttempts(instance);
        setState(instance, STATE.IDLE);
      }
    },

    onVerify: function(callback) {
      globalOnVerify = callback;
    },

    isVerified: function(container) {
      if (typeof container === "string") {
        container = document.querySelector(container);
      }
      var instance = instances.get(container);
      return instance ? instance.state === STATE.VERIFIED : false;
    },

    refresh: function(container) {
      if (typeof container === "string") {
        container = document.querySelector(container);
      }
      var instance = instances.get(container);
      if (instance) {
        handleRefresh(instance);
      }
    }
  };

  // Auto-initialize on DOM ready
  function autoInit() {
    injectStyles();
    var containers = document.querySelectorAll("[data-noise-captcha]");
    containers.forEach(function(container) {
      initInstance(container);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }

})();
