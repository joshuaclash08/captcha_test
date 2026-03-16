# Client Widget

The Noise CAPTCHA widget is a **single JavaScript file** that loads from the CAPTCHA server and handles everything automatically.

## Integration

### Basic Usage

```html
<!-- Add the script -->
<script src="https://your-captcha-server.com/captcha.js"></script>

<!-- Add the widget container with your site key -->
<div data-noise-captcha data-sitekey="nc_pk_your_site_key"></div>
```

That's it! The script:
1. Auto-detects the server URL from its own `src` attribute
2. Validates the site key against your registered domain
3. Loads WASM from the same server
4. Auto-initializes all `[data-noise-captcha]` elements

### Required Attributes

| Attribute | Description |
|-----------|-------------|
| `data-noise-captcha` | Marks the container for the widget |
| `data-sitekey` | Your public site key (required) |

### Optional Attributes

| Attribute | Description |
|-----------|-------------|
| `data-action` | Action label for analytics (like reCAPTCHA v3) |
| `data-theme` | Widget theme (`light` or `dark`) |
| `data-lang` | Language code for widget UI text (`en`, `ko`, `ja`). Falls back to `navigator.language` then `en`. |

### Example with Action

```html
<div 
  data-noise-captcha 
  data-sitekey="nc_pk_your_site_key"
  data-action="login"
></div>
```

### Localization

```html
<!-- Korean -->
<div data-noise-captcha data-sitekey="nc_pk_xxx" data-lang="ko"></div>
<!-- Japanese -->
<div data-noise-captcha data-sitekey="nc_pk_xxx" data-lang="ja"></div>
```

Supported language codes: `en` (default), `ko`, `ja`. Auto-detected from `navigator.language` if `data-lang` is not set.

### Manual Initialization

```javascript
// Render in a specific container
window.NoiseCaptcha.render(document.getElementById('my-captcha'));

// Or with a selector
window.NoiseCaptcha.render('#my-captcha');
```

## API Reference

### `NoiseCaptcha.render(container)`

Render the CAPTCHA widget in a container element.

```javascript
NoiseCaptcha.render('#captcha');
NoiseCaptcha.render(document.getElementById('captcha'));
```

### `NoiseCaptcha.getToken(container?)`

Get the verification token after the user completes the CAPTCHA.

```javascript
const token = NoiseCaptcha.getToken('#captcha');
// Returns UUID token string or null
```

### `NoiseCaptcha.reset(container?)`

Reset the CAPTCHA to its initial state.

```javascript
NoiseCaptcha.reset('#captcha');
```

### `NoiseCaptcha.onVerify(callback)`

Set a callback function that fires when the user completes the CAPTCHA.

```javascript
NoiseCaptcha.onVerify((token, container) => {
  console.log('Token:', token);
  // Enable submit button, etc.
});
```

### `NoiseCaptcha.isVerified(container?)`

Check if the CAPTCHA has been completed.

```javascript
if (NoiseCaptcha.isVerified('#captcha')) {
  // Allow form submission
}
```

### `NoiseCaptcha.refresh(container?)`

Request a new challenge.

```javascript
NoiseCaptcha.refresh('#captcha');
```

## Widget States

| State | Description |
|-------|-------------|
| `idle` | Initial state, checkbox visible |
| `loading` | Loading WASM and challenge |
| `active` | Challenge visible, awaiting input |
| `verifying` | Checking answer with server |
| `verified` | Successfully completed |
| `error` | Something went wrong |

## Form Integration

Important: The `secret` key (`nc_sk_*`) must never be sent from browser code. Send only the CAPTCHA token to your backend, then your backend should call `/api/captcha/validate-token`.

### Standard Form

```html
<form id="login-form">
  <input type="email" name="email" />
  <input type="password" name="password" />
  <div data-noise-captcha></div>
  <button type="submit">Login</button>
</form>

<script src="https://captcha.example.com/captcha.js"></script>
<script>
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    
    const token = NoiseCaptcha.getToken();
    if (!token) {
      alert('Please complete the CAPTCHA');
      return;
    }
    
    const formData = new FormData(e.target);
    formData.append('captchaToken', token);
    
    const response = await fetch('/api/login', {
      method: 'POST',
      body: formData
    });
    
    // Handle response...
  };
</script>
```

### React Integration

```jsx
import { useEffect, useRef, useState } from 'react';

function NoiseCaptcha({ onVerify }) {
  const containerRef = useRef(null);
  
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://captcha.example.com/captcha.js';
    script.async = true;
    document.head.appendChild(script);
    
    script.onload = () => {
      window.NoiseCaptcha.render(containerRef.current);
      window.NoiseCaptcha.onVerify((token, container) => {
        if (container === containerRef.current) {
          onVerify(token);
        }
      });
    };
    
    return () => script.remove();
  }, [onVerify]);
  
  return <div ref={containerRef} />;
}

// Usage
function LoginForm() {
  const [token, setToken] = useState(null);
  
  return (
    <form>
      <input type="email" />
      <input type="password" />
      <NoiseCaptcha onVerify={setToken} />
      <button disabled={!token}>Login</button>
    </form>
  );
}
```

## Accessibility

The widget is keyboard accessible and screen-reader friendly:

- Checkbox row uses `role="checkbox"` with `aria-checked` state
- Modal uses `role="dialog"` with `aria-modal` and `aria-label`
- Canvas uses `role="img"` with a descriptive `aria-label`
- Error and status messages use `aria-live` regions
- **Keyboard:** Press `Enter` or `Space` on the checkbox to start the challenge
- All buttons have `aria-label` attributes

## Styling

The widget uses shadow DOM isolation and includes its own styles. You can customize the container:

```css
[data-noise-captcha] {
  margin: 20px 0;
}
```

## WASM Loading

The widget automatically loads WASM from the same server:

```
/captcha.js       ← Widget script
/engine.js       ← WASM glue
/engine.wasm     ← Compiled WASM
```

Files are loaded on-demand when the user clicks the checkbox.

## Debug Mode

When `DEBUG_MODE=true` on the server, access the debug controller at:

```
https://your-captcha-server.com/debug
```

Features:
- Real-time parameter sliders
- Direction/speed controls
- Anti-averaging toggles
- Custom text input
- FPS counter
- Direction gap indicator
