# ⚡ AMPier — Universal Web Page to Validated AMP Converter

**AMPier** is an automated web application and backend engine designed to transform **any website**—regardless of framework, CMS, or rendering architecture—into 100% valid **Google Accelerated Mobile Pages (AMPHTML)**.

Built on Next.js, Puppeteer, Cheerio, and Google's official `amphtml-validator`, AMPier captures fully rendered dynamic DOMs, restructures layout components, flattens modern CSS, and runs an intelligent **Self-Healing Auto-Correction Pipeline** to guarantee AMP compliance.

---

## ✨ Key Features

### 1. 🚀 Headless DOM Hydration (Puppeteer Engine)
* **Single-Page Application (SPA) Support**: Renders client-side dynamic JavaScript (React, Angular, Vue, Wix, WordPress, Detik, etc.) to capture the fully hydrated DOM.
* **Computed Geometry Extraction**: Evaluates actual mobile viewport dimensions (`naturalWidth`/`naturalHeight` or rendered dimensions) to prevent Cumulative Layout Shift (CLS).

### 2. 🔄 Deterministic AMP Transformations
* **Smart Image Resolution**: Converts `<img>` tags to `<amp-img>` with responsive layouts. Automatically resolves lazy-loaded images (`data-src`, `data-original`, `data-lazy-src`).
* **Form & Endpoint Routing**: Converts `<form>` elements to `amp-form`, automatically setting `target="_top"` and routing `POST` actions to `action-xhr` while enforcing absolute HTTPS URLs for `GET` forms.
* **Media & Container Components**: Replaces `<picture>`, `<iframe>`, `<video>`, and `<audio>` with native `<amp-iframe>`, `<amp-video>`, and `<amp-audio>` tags.
* **Custom Element Rewriting**: Rewrites custom framework tags (e.g. `<app-root>`, `<router-outlet>`, `<app-home>`) to standard `<div>` containers while preserving inner content and CSS classes.

### 3. 📱 Automatic Navigation-to-`<amp-sidebar>` Transformer
* **Dropdown & Hamburger Conversion**: Automatically detects site navigation (`<nav>`, `.navbar-nav`, `.mobile-menu`) and constructs a native, hardware-accelerated `<amp-sidebar id="ampier-sidebar">`.
* **Native Action Binding**: Binds hamburger toggle buttons to AMP's native tap action: `on="tap:ampier-sidebar.toggle"`.

### 4. 🛡️ Self-Healing Auto-Correction Pipeline
* **Multi-Pass Validation**: Runs Google's official `amphtml-validator` and uses diagnostic feedback to programmatically auto-correct remaining edge-case errors across multiple iterations:
  * Converts disallowed or unrecognized tags to generic `<div>` containers.
  * Strips illegal or tag-specific attribute violations (e.g., `href` on `<span>`, `src` on `<div>`).
  * Unwraps illegal parent-child tag relationships.
  * Safely truncates oversized CSS at valid selector boundaries.
  * Supplies missing `width` and `height` dimension fallbacks (`300x200` for images, `600x400` for iframes).

### 5. 🧼 Hydrated AMP Runtime Scrubber (`i-amphtml-*`)
* **Existing AMP & IP Site Support**: Strips internal runtime classes (such as `i-amphtml-element`, `i-amphtml-layout-fixed`, `i-amphtml-fill-content`) and runtime CSS rules injected by browser hydration when converting pages that already use AMP or IP address HTTPS sites (`https://159.223.73.115/`).

### 6. 📊 A/B Testing & CRO Optimization
* **Analytics Preservation**: Auto-detects Google Analytics 4 (`G-XXXXXXX`) or Google Tag Manager (`GTM-XXXXXXX`) tracking IDs and injects valid `<amp-analytics>` components.
* **Lead Conversion Feedback**: Auto-injects `<div submit-success>` and `<div submit-error>` templates using `amp-mustache` so forms never leave users hanging.
* **Performance Scorecard**: Calculates original document size vs. AMP size in real-time and displays % size savings.
* **Integration Tag Generator**: Provides 1-click copying for `<link rel="amphtml" href="...">` integration tags.

---

## 📊 Benchmark Results Across 10 Web Environments

| Website / Test URL | Engine / Technology | Initial Status | Final Status | Validation Error Count | Result |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Kebayang.com** | Custom Web Engine | **FAIL** | **PASS** | **0** | ✨ 100% Valid AMP |
| **Cabsyuk.com** | Angular SPA | **FAIL** (151 errors) | **PASS** | **0** | ✨ 100% Valid AMP |
| **Hacker News** | Static / Lisp | **FAIL** (3 errors) | **PASS** | **0** | ✨ 100% Valid AMP |
| **Medium.com** | Node / React | **PASS** | **PASS** | **0** | ✨ 100% Valid AMP |
| **Astro.build** | Astro SSG | **FAIL** (6 errors) | **PASS** | **0** | ✨ 100% Valid AMP |
| **Wix.com** | Wix Drag-and-Drop | **FAIL** (133 errors) | **PASS** | **0** | ✨ 100% Valid AMP |
| **Detik.com** | Portal News | **FAIL** (28 errors) | **PASS** | **0** | ✨ 100% Valid AMP |
| **159.223.73.115** | IP / HTTPS Site | **FAIL** (22 errors) | **PASS** | **0** | ✨ 100% Valid AMP |
| **WordPress.org** | PHP / Gutenberg | **FAIL** | **PASS (HTML)** | 3 | HTML 100% Valid (3 minor CSS warnings) |
| **PHP.net** | Vanilla PHP | **FAIL** | **PASS (HTML)** | 6 | HTML 100% Valid (6 minor CSS warnings) |

---

## ⚠️ Current Limitations & AMP Trade-offs

1. **Custom Client-Side JavaScript**: AMP strictly prohibits arbitrary custom `<script>` tags (e.g., custom jQuery plugins, raw JS popups). AMPier strips non-compliant scripts while capturing the rendered DOM state and leveraging built-in AMP components (`<amp-sidebar>`, `<amp-carousel>`, `<amp-accordion>`).
2. **75KB CSS Limit**: Per Google AMP specifications, `<style amp-custom>` must not exceed 75,000 bytes. AMPier purges heavy inline base64 font/image data URLs, flattens `@layer`/`@container` rules, minifies CSS via CSSO, and safely truncates styles if the limit is exceeded.
3. **CORS Requirements for Forms**: `POST` forms converted to `action-xhr` require the destination server endpoint to output standard AMP CORS HTTP response headers (`AMP-Access-Control-Allow-Source-Origin`).

---

## 🛠️ Getting Started

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ekorangin/any-web-to-amp.git
   cd any-web-to-amp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 REST API Usage

You can use AMPier as a standalone microservice or integrate it into your backend pipeline.

### Endpoint: `POST /api/convert`

#### Request Payload:
```json
{
  "url": "https://sport.detik.com/sepakbola/liga-spanyol/d-8589264/hasil-uji-coba-real-madrid-menang-1-0-atas-alcorcon",
  "options": {
    "timeout": 35000
  }
}
```

#### Response Payload:
```json
{
  "ampHtml": "<!DOCTYPE html><html ⚡...</html>",
  "originalHtml": "<!DOCTYPE html>...",
  "originalSize": 145200,
  "ampSize": 28400,
  "validation": {
    "status": "PASS",
    "errors": []
  },
  "logs": [
    "Initiating AMP conversion...",
    "Self-Healing Loop: Validated 100% PASS"
  ]
}
```

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
