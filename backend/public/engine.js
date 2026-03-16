/* @ts-self-types="./noise_captcha_wasm.d.ts" */

/**
 * The main CAPTCHA rendering engine, fully self-contained in WASM.
 *
 * All rendering is done by producing raw RGBA pixel buffers and writing them
 * to the canvas via `putImageData` — no `fillText` or other high-level
 * Canvas API calls are ever made, preventing API-hooking attacks.
 *
 * The encrypted payload now includes noise configuration to prevent MITM tampering.
 * Attackers cannot modify animation parameters (speed, direction, jitter) without
 * breaking the AES-GCM authentication tag.
 */
export class CaptchaEngine {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CaptchaEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_captchaengine_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get_bg_direction() {
        const ret = wasm.captchaengine_get_bg_direction(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_bg_speed() {
        const ret = wasm.captchaengine_get_bg_speed(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_frame_count() {
        const ret = wasm.captchaengine_get_frame_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {boolean}
     */
    get_jitter_enabled() {
        const ret = wasm.captchaengine_get_jitter_enabled(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get_jitter_magnitude() {
        const ret = wasm.captchaengine_get_jitter_magnitude(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_noise_regen_interval() {
        const ret = wasm.captchaengine_get_noise_regen_interval(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get_step_ms() {
        const ret = wasm.captchaengine_get_step_ms(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    get_temporal_phase_enabled() {
        const ret = wasm.captchaengine_get_temporal_phase_enabled(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get_text_direction() {
        const ret = wasm.captchaengine_get_text_direction(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_text_speed() {
        const ret = wasm.captchaengine_get_text_speed(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_viewport_h() {
        const ret = wasm.captchaengine_get_viewport_h(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get_viewport_w() {
        const ret = wasm.captchaengine_get_viewport_w(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Check if config was securely loaded from encrypted payload
     * @returns {boolean}
     */
    is_config_secure() {
        const ret = wasm.captchaengine_is_config_secure(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Create a new engine.
     * `encrypted_payload` is the AES-256-GCM encrypted glyph bitmap + noise config from the server.
     *
     * Decrypted payload format (16-byte header + bitmap):
     * ```
     * [mask_w: u16 LE]              (2 bytes) - bytes 0-1
     * [mask_h: u16 LE]              (2 bytes) - bytes 2-3
     * [textDirection: u16 LE]       (2 bytes) - bytes 4-5
     * [bgDirection: u16 LE]         (2 bytes) - bytes 6-7
     * [textSpeed: u8]               (1 byte)  - byte 8
     * [bgSpeed: u8]                 (1 byte)  - byte 9
     * [stepMs: u16 LE]              (2 bytes) - bytes 10-11
     * [flags: u8]                   (1 byte)  - byte 12
     * [jitterMagnitude: u8]         (1 byte)  - byte 13
     * [noiseRegenInterval: u16 LE]  (2 bytes) - bytes 14-15
     * [alpha bitmap bytes]          (N bytes) - bytes 16+
     * ```
     *
     * Flags byte: bit0 = jitterEnabled, bit1 = temporalPhaseEnabled
     * @param {number} viewport_w
     * @param {number} viewport_h
     * @param {number} cell_size
     * @param {Uint8Array} encrypted_payload
     */
    constructor(viewport_w, viewport_h, cell_size, encrypted_payload) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(encrypted_payload, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.captchaengine_new(retptr, viewport_w, viewport_h, cell_size, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            CaptchaEngineFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Regenerate all noise buffers (e.g. after resize or manual refresh).
     */
    regenerate_noise() {
        wasm.captchaengine_regenerate_noise(this.__wbg_ptr);
    }
    /**
     * Render one frame and write it to the canvas via `putImageData`.
     * @param {CanvasRenderingContext2D} ctx
     */
    render_frame(ctx) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.captchaengine_render_frame(retptr, this.__wbg_ptr, addBorrowedObject(ctx));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * @param {number} deg
     */
    set_bg_direction(deg) {
        wasm.captchaengine_set_bg_direction(this.__wbg_ptr, deg);
    }
    /**
     * @param {number} speed
     */
    set_bg_speed(speed) {
        wasm.captchaengine_set_bg_speed(this.__wbg_ptr, speed);
    }
    /**
     * @param {boolean} enabled
     */
    set_jitter_enabled(enabled) {
        wasm.captchaengine_set_jitter_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * @param {number} mag
     */
    set_jitter_magnitude(mag) {
        wasm.captchaengine_set_jitter_magnitude(this.__wbg_ptr, mag);
    }
    /**
     * @param {number} frames
     */
    set_noise_regen_interval(frames) {
        wasm.captchaengine_set_noise_regen_interval(this.__wbg_ptr, frames);
    }
    /**
     * @param {number} ms
     */
    set_step_ms(ms) {
        wasm.captchaengine_set_step_ms(this.__wbg_ptr, ms);
    }
    /**
     * @param {boolean} enabled
     */
    set_temporal_phase_enabled(enabled) {
        wasm.captchaengine_set_temporal_phase_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * @param {number} deg
     */
    set_text_direction(deg) {
        wasm.captchaengine_set_text_direction(this.__wbg_ptr, deg);
    }
    /**
     * @param {number} speed
     */
    set_text_speed(speed) {
        wasm.captchaengine_set_text_speed(this.__wbg_ptr, speed);
    }
    /**
     * Advance animation state by `delta_ms` milliseconds.
     * Returns `true` if a step was taken (offsets changed).
     * @param {number} delta_ms
     * @returns {boolean}
     */
    step(delta_ms) {
        const ret = wasm.captchaengine_step(this.__wbg_ptr, delta_ms);
        return ret !== 0;
    }
}
if (Symbol.dispose) CaptchaEngine.prototype[Symbol.dispose] = CaptchaEngine.prototype.free;

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_is_function_3c846841762788c1: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_781bc9f159099513: function(arg0) {
            const val = getObject(arg0);
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_7ef6b97b02428fae: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_52709e72fb9f179c: function(arg0) {
            const ret = getObject(arg0) === undefined;
            return ret;
        },
        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_2d781c1f4d5c0ef8: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = getObject(arg0).crypto;
            return addHeapObject(ret);
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).getRandomValues(getObject(arg1));
        }, arguments); },
        __wbg_length_ea16607d7b61445b: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = getObject(arg0).msCrypto;
            return addHeapObject(ret);
        },
        __wbg_new_with_length_825018a1616e9e55: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_new_with_u8_clamped_array_and_sh_5d9be5b17e50951c: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = new ImageData(getClampedArrayU8FromWasm0(arg0, arg1), arg2 >>> 0, arg3 >>> 0);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = getObject(arg0).node;
            return addHeapObject(ret);
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = getObject(arg0).process;
            return addHeapObject(ret);
        },
        __wbg_prototypesetcall_d62e5099504357e6: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), getObject(arg2));
        },
        __wbg_putImageData_1750176f4dd07174: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            getObject(arg0).putImageData(getObject(arg1), arg2, arg3);
        }, arguments); },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).randomFillSync(takeObject(arg1));
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return addHeapObject(ret);
        }, arguments); },
        __wbg_static_accessor_GLOBAL_8adb955bd33fac2f: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_SELF_f207c857566db248: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_WINDOW_bb9f1ba69d61b386: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_subarray_a068d24e39478a8a: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).subarray(arg1 >>> 0, arg2 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = getObject(arg0).versions;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_object_clone_ref: function(arg0) {
            const ret = getObject(arg0);
            return addHeapObject(ret);
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./noise_captcha_wasm_bg.js": import0,
    };
}

const CaptchaEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_captchaengine_free(ptr >>> 0, 1));

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function addBorrowedObject(obj) {
    if (stack_pointer == 1) throw new Error('out of js stack');
    heap[--stack_pointer] = obj;
    return stack_pointer;
}

function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getClampedArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ClampedArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let cachedUint8ClampedArrayMemory0 = null;
function getUint8ClampedArrayMemory0() {
    if (cachedUint8ClampedArrayMemory0 === null || cachedUint8ClampedArrayMemory0.byteLength === 0) {
        cachedUint8ClampedArrayMemory0 = new Uint8ClampedArray(wasm.memory.buffer);
    }
    return cachedUint8ClampedArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_export(addHeapObject(e));
    }
}

let heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let stack_pointer = 1024;

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    cachedUint8ClampedArrayMemory0 = null;
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('engine.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
