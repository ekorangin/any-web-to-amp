const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const csso = require('csso');
const amphtmlValidator = require('amphtml-validator');

// List of standard attributes allowed in AMP HTML tags
const SAFE_ATTRIBUTES = new Set([
  'id', 'class', 'href', 'src', 'alt', 'title', 'target', 'rel', 
  'width', 'height', 'layout', 'media', 'type', 'value', 'placeholder', 
  'name', 'rows', 'cols', 'checked', 'selected', 'disabled', 'readonly', 
  'multiple', 'required', 'pattern', 'min', 'max', 'step', 'autoplay', 
  'loop', 'muted', 'controls', 'poster', 'preload', 'srcset', 'sizes', 
  'crossorigin', 'integrity', 'sandbox', 'allow', 'allowfullscreen', 'loading', 
  'role', 'fallback', 'heights', 'lang', 'dir', 'action', 'method', 
  'novalidate', 'accept-charset'
]);

// Map of AMP tags to their official script extension metadata
const AMP_COMPONENT_SCRIPTS = [
  { selector: 'amp-iframe', name: 'amp-iframe', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-iframe-0.1.js' },
  { selector: 'amp-video', name: 'amp-video', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-video-0.1.js' },
  { selector: 'amp-audio', name: 'amp-audio', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-audio-0.1.js' },
  { selector: 'amp-anim', name: 'amp-anim', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-anim-0.1.js' },
  { selector: 'amp-carousel', name: 'amp-carousel', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-carousel-0.1.js' },
  { selector: 'amp-fit-text', name: 'amp-fit-text', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-fit-text-0.1.js' },
  { selector: 'amp-lightbox', name: 'amp-lightbox', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-lightbox-0.1.js' },
  { selector: 'amp-sidebar', name: 'amp-sidebar', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-sidebar-0.1.js' },
  { selector: 'amp-accordion', name: 'amp-accordion', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-accordion-0.1.js' },
  { selector: 'form', name: 'amp-form', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-form-0.1.js' },
  { selector: 'amp-analytics', name: 'amp-analytics', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-analytics-0.1.js' },
  { selector: 'template[type="amp-mustache"]', name: 'amp-mustache', type: 'custom-template', url: 'https://cdn.ampproject.org/v0/amp-mustache-0.2.js' },
  { selector: '[amp-bind]', name: 'amp-bind', type: 'custom-element', url: 'https://cdn.ampproject.org/v0/amp-bind-0.1.js' }
];

/**
 * Checks if an HTML attribute name is allowed in AMP.
 */
function isAttributeSafe(attrName) {
  const name = attrName.toLowerCase();
  if (name === 'amp' || name === '⚡' || name === 'action-xhr') return true;
  if (SAFE_ATTRIBUTES.has(name)) return true;
  if (name.startsWith('data-')) return true;
  if (name.startsWith('aria-')) return true;
  if (name.startsWith('amp-')) return true;
  return false;
}

/**
 * Fetches a webpage using Puppeteer, transforms its HTML and CSS into AMP-compliant markup,
 * and validates/self-heals the resulting AMP HTML.
 * 
 * @param {string} targetUrl The URL of the page to convert
 * @param {object} options Conversion options (e.g. timeout, viewport settings)
 * @returns {Promise<{ampHtml: string, originalHtml: string, validation: {status: string, errors: Array}, logs: Array}>}
 */
async function convertUrlToAmp(targetUrl, options = {}) {
  const logs = [];
  let browser = null;
  let originalHtml = '';
  let ampHtml = '';
  let validationResult = { status: 'UNKNOWN', errors: [] };

  try {
    logs.push(`Launching headless browser to load: ${targetUrl}`);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set user agent to a standard mobile browser to fetch mobile layout if responsive
    await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36');
    await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });

    // Navigate to URL
    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 35000
    });

    // Capture original fully rendered HTML
    originalHtml = await page.content();
    logs.push(`Successfully loaded page. Document size: ${originalHtml.length} bytes`);

    // Extract dynamic images with dimensions from the rendered DOM
    const imagesMetadata = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.getAttribute('src'),
        currentSrc: img.currentSrc,
        width: img.naturalWidth || img.clientWidth || 300,
        height: img.naturalHeight || img.clientHeight || 200
      }));
    });
    logs.push(`Extracted metadata for ${imagesMetadata.length} image elements`);

    // Extract page stylesheets URLs
    const stylesheetUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => link.href);
    });
    logs.push(`Found ${stylesheetUrls.length} external stylesheets`);

    // Close the browser as we have the rendered HTML and details
    await browser.close();
    browser = null;

    // Load HTML in Cheerio for static rewriting
    const $ = cheerio.load(originalHtml);

    // 1. Transform HTML tag: <html> to <html amp>
    $('html').attr('amp', '');

    // Strip pre-existing style[amp-boilerplate] tags so we don't have duplicates
    $('style[amp-boilerplate]').remove();

    // Strip internal AMP runtime classes (i-amphtml-*) injected by browser hydration
    $('*[class]').each((i, el) => {
      const currentClass = $(el).attr('class');
      if (currentClass) {
        const cleanClass = currentClass
          .split(/\s+/)
          .filter(c => !c.startsWith('i-amphtml-') && !c.startsWith('-amp-'))
          .join(' ');
        if (cleanClass.trim()) {
          $(el).attr('class', cleanClass);
        } else {
          $(el).removeAttr('class');
        }
      }
    });

    // Remove pre-existing noscript tags to prevent invalid children (like link/iframe) inside them
    $('noscript').remove();
    // Remove canvas elements since their dynamic JS is stripped and they violate AMP rules
    $('canvas').remove();
    logs.push('Removed existing noscript and canvas elements');

    // Remove base tags as they break relative links pointing to the AMP CDN
    $('base').remove();

    // Remove invalid meta tags missing content attribute
    $('meta[name]:not([content])').remove();

    // Replace <picture> elements with their nested <img> elements
    $('picture').each((i, el) => {
      const $el = $(el);
      const img = $el.find('img');
      if (img.length > 0) {
        $el.replaceWith(img);
      } else {
        $el.remove();
      }
    });

    // Fix javascript: protocol links
    $('a[href^="javascript:"]').each((i, el) => {
      const $el = $(el);
      $el.attr('href', '#');
    });

    // Clean templating and preloads (which are banned or unused since JS is stripped)
    $('template').remove();
    $('link[rel="modulepreload"], link[rel="preload"][as="script"]').remove();

    // Clean dialog elements by rewriting them to generic divs
    $('dialog').each((i, el) => {
      const $el = $(el);
      const div = $('<div></div>');
      const attrs = el.attribs;
      if (attrs) {
        for (const attr in attrs) {
          div.attr(attr, attrs[attr]);
        }
      }
      div.append($el.html());
      $el.replaceWith(div);
    });

    // Enforce form target and action-xhr requirements
    $('form').each((i, el) => {
      const $el = $(el);
      const target = $el.attr('target');
      if (!target || (target !== '_blank' && target !== '_top')) {
        $el.attr('target', '_top');
      }

      const method = ($el.attr('method') || 'GET').toUpperCase();
      const action = $el.attr('action') || targetUrl;

      if (method === 'POST') {
        $el.attr('action-xhr', action);
        $el.removeAttr('action');
      } else {
        // GET forms require 'action' and cannot have 'action-xhr'
        let absoluteAction = action;
        if (!action.startsWith('https://') && !action.startsWith('//')) {
          try {
            absoluteAction = new URL(action, targetUrl).toString();
          } catch (e) {
            absoluteAction = targetUrl;
          }
        }
        if (!absoluteAction.startsWith('https://') && !absoluteAction.startsWith('//')) {
          absoluteAction = absoluteAction.replace(/^http:/i, 'https:');
        }
        $el.attr('action', absoluteAction);
        $el.removeAttr('action-xhr');
      }

      // Inject AMP form submit feedback templates if missing
      if ($el.find('[submit-success]').length === 0) {
        $el.append('<div submit-success><template type="amp-mustache"><div style="padding: 0.6rem; background: rgba(16,185,129,0.1); border: 1px solid #10b981; color: #34d399; border-radius: 6px; margin-top: 0.5rem; font-size: 0.85rem;">✓ Form submitted successfully!</div></template></div>');
      }
      if ($el.find('[submit-error]').length === 0) {
        $el.append('<div submit-error><template type="amp-mustache"><div style="padding: 0.6rem; background: rgba(239,68,68,0.1); border: 1px solid #ef4444; color: #f87171; border-radius: 6px; margin-top: 0.5rem; font-size: 0.85rem;">✕ Submission failed. Please try again.</div></template></div>');
      }
    });

    // Auto-detect Analytics Tracking IDs (GA4 / GTM) and inject <amp-analytics>
    const ga4Match = originalHtml.match(/G-[A-Z0-9]{8,12}/i);
    const gtmMatch = originalHtml.match(/GTM-[A-Z0-9]{6,10}/i);
    let detectedAnalytics = null;

    if (ga4Match) {
      detectedAnalytics = { type: 'GA4', id: ga4Match[0] };
      logs.push(`Auto-detected Google Analytics 4 ID: ${ga4Match[0]}. Preserving analytics via <amp-analytics>.`);
    } else if (gtmMatch) {
      detectedAnalytics = { type: 'GTM', id: gtmMatch[0] };
      logs.push(`Auto-detected Google Tag Manager ID: ${gtmMatch[0]}. Preserving tracking via <amp-analytics>.`);
    }

    if (detectedAnalytics && $('amp-analytics').length === 0) {
      if (detectedAnalytics.type === 'GA4') {
        const ampAnalytics = $(`
          <amp-analytics type="gtag" id="gtag">
            <script type="application/json">
              {
                "vars": { "gtag_id": "${detectedAnalytics.id}" },
                "triggers": { "pageview": { "on": "visible", "request": "pageview" } }
              }
            </script>
          </amp-analytics>
        `);
        $('body').append(ampAnalytics);
      }
    }

    // Automatically detect and convert navigation menus & dropdowns to native <amp-sidebar>
    const navSelector = 'nav, .navbar-nav, .main-navigation, .mobile-menu, header ul';
    const navElement = $(navSelector).first();
    if (navElement.length > 0 && $('amp-sidebar').length === 0) {
      const ampSidebar = $('<amp-sidebar id="ampier-sidebar" layout="nodisplay" side="right" class="ampier-sidebar-style"></amp-sidebar>');
      
      // Add clean close button
      const closeBtn = $('<button class="ampier-sidebar-close" on="tap:ampier-sidebar.close" aria-label="Close Menu">✕</button>');
      ampSidebar.append(closeBtn);

      // Clone and sanitize navigation menu
      const navClone = navElement.clone();
      navClone.find('[style]').removeAttr('style');
      navClone.find('[onclick]').removeAttr('onclick');
      
      // Structure nested submenus cleanly
      navClone.find('ul').addClass('ampier-sidebar-sublist');

      ampSidebar.append(navClone);
      $('body').prepend(ampSidebar);

      // Find or bind hamburger toggle button
      const toggleBtn = $('.menu-toggle, .hamburger, .nav-toggle, [aria-label*="menu"], [class*="hamburger"], [class*="menu-btn"]').first();
      if (toggleBtn.length > 0) {
        toggleBtn.attr('on', 'tap:ampier-sidebar.toggle');
        toggleBtn.removeAttr('onclick');
      } else {
        const header = $('header').first();
        const injectedBtn = $('<button class="ampier-injected-menu-btn" on="tap:ampier-sidebar.toggle" aria-label="Open Menu">☰ Menu</button>');
        if (header.length > 0) {
          header.append(injectedBtn);
        } else {
          $('body').prepend(injectedBtn);
        }
      }

      logs.push('Transformed website navigation menu into native <amp-sidebar>');
    }

    // 2. Remove standard dynamic scripts, except JSON-LD metadata
    $('script:not([type="application/ld+json"])').remove();
    logs.push('Removed non-compliant JavaScript script tags');

    // 3. Replace <img> with <amp-img>
    let transformedImgCount = 0;
    $('img').each((i, el) => {
      const $el = $(el);
      let src = $el.attr('data-src') || $el.attr('data-original') || $el.attr('data-lazy-src') || $el.attr('src');
      if (!src || src.startsWith('data:image/svg') || src.startsWith('data:image/gif')) {
        const realSrc = $el.attr('data-src') || $el.attr('data-original') || $el.attr('data-lazy-src');
        if (realSrc) {
          src = realSrc;
        } else if (!src) {
          $el.remove();
          return;
        }
      }

      let absoluteSrc = src;
      try {
        absoluteSrc = new URL(src, targetUrl).toString();
      } catch (err) {}

      const ampImg = $('<amp-img></amp-img>');
      ampImg.attr('src', absoluteSrc);

      const attrsToCopy = ['class', 'alt', 'title', 'srcset', 'sizes'];
      attrsToCopy.forEach(attr => {
        const val = $el.attr(attr);
        if (val !== undefined && !val.startsWith('i-amphtml-')) ampImg.attr(attr, val);
      });

      let width = $el.attr('width');
      let height = $el.attr('height');

      if (!width || !height || width === '0' || height === '0' || width === 'auto' || height === 'auto') {
        const match = imagesMetadata.find(m => m.src === src || m.currentSrc === src || m.src === absoluteSrc);
        if (match && match.width > 0 && match.height > 0) {
          width = match.width;
          height = match.height;
        } else {
          width = width && width !== 'auto' ? width : '300';
          height = height && height !== 'auto' ? height : '200';
        }
      }

      width = width ? width.toString().replace(/px/g, '').trim() : '300';
      height = height ? height.toString().replace(/px/g, '').trim() : '200';

      ampImg.attr('width', width || '300');
      ampImg.attr('height', height || '200');
      ampImg.attr('layout', 'responsive');

      $el.replaceWith(ampImg);
      transformedImgCount++;
    });
    logs.push(`Transformed ${transformedImgCount} <img> elements to <amp-img>`);

    // 4. Replace <iframe> with <amp-iframe>
    let transformedIframeCount = 0;
    $('iframe').each((i, el) => {
      const $el = $(el);
      const src = $el.attr('src');
      if (!src) {
        $el.remove();
        return;
      }

      let absoluteSrc = src;
      try {
        absoluteSrc = new URL(src, targetUrl).toString();
      } catch (err) {}

      if (!absoluteSrc.startsWith('https://') && !absoluteSrc.startsWith('//')) {
        $el.remove();
        return;
      }

      const ampIframe = $('<amp-iframe></amp-iframe>');
      ampIframe.attr('src', absoluteSrc);
      ampIframe.attr('width', $el.attr('width') || '600');
      ampIframe.attr('height', $el.attr('height') || '400');
      ampIframe.attr('layout', 'responsive');
      ampIframe.attr('sandbox', $el.attr('sandbox') || 'allow-scripts allow-same-origin allow-popups');

      if ($el.attr('class')) ampIframe.attr('class', $el.attr('class'));

      $el.replaceWith(ampIframe);
      transformedIframeCount++;
    });

    // 5. Replace <video> and <audio> elements
    $('video').each((i, el) => {
      const $el = $(el);
      const ampVideo = $('<amp-video></amp-video>');
      const attrs = el.attribs;
      for (const attr in attrs) {
        ampVideo.attr(attr, attrs[attr]);
      }
      ampVideo.attr('layout', 'responsive');
      if (!ampVideo.attr('width')) ampVideo.attr('width', '640');
      if (!ampVideo.attr('height')) ampVideo.attr('height', '360');
      ampVideo.append($el.html());
      $el.replaceWith(ampVideo);
    });

    $('audio').each((i, el) => {
      const $el = $(el);
      const ampAudio = $('<amp-audio></amp-audio>');
      const attrs = el.attribs;
      for (const attr in attrs) {
        ampAudio.attr(attr, attrs[attr]);
      }
      ampAudio.append($el.html());
      $el.replaceWith(ampAudio);
    });

    // 6. Gather and process CSS
    let rawCSS = '';

    // Collect and remove inline style tags
    $('style:not([amp-boilerplate])').each((i, el) => {
      rawCSS += $(el).text() + '\n';
      $(el).remove();
    });

    // Fetch and aggregate external stylesheets
    for (const styleUrl of stylesheetUrls) {
      try {
        let absoluteUrl = styleUrl;
        if (!styleUrl.startsWith('http://') && !styleUrl.startsWith('https://')) {
          absoluteUrl = new URL(styleUrl, targetUrl).toString();
        }
        
        const res = await fetch(absoluteUrl);
        if (res.ok) {
          const cssText = await res.text();
          rawCSS += cssText + '\n';
        }
      } catch (err) {}
    }
    $('link[rel="stylesheet"]').remove();

    // Collect style attributes on HTML tags and map to unique classes
    let inlineStyleCounter = 0;
    let inlineCSS = '';
    $('[style]').each((i, el) => {
      const $el = $(el);
      const styleContent = $el.attr('style');
      if (styleContent) {
        inlineStyleCounter++;
        const className = `ampier-inline-${inlineStyleCounter}`;
        const sanitizedStyle = styleContent.replace(/!important/g, '');
        inlineCSS += `.${className} { ${sanitizedStyle} }\n`;
        $el.addClass(className);
        $el.removeAttr('style');
      }
    });

    inlineCSS += `
      .ampier-sidebar-style { background: #0f172a; color: #fff; padding: 2rem 1.5rem; width: 280px; font-family: sans-serif; }
      .ampier-sidebar-style a { color: #f8fafc; text-decoration: none; display: block; padding: 0.6rem 0; font-size: 1rem; font-weight: 500; border-bottom: 1px solid rgba(255,255,255,0.05); }
      .ampier-sidebar-style ul { list-style: none; padding: 0; margin: 0; }
      .ampier-sidebar-style .ampier-sidebar-sublist { padding-left: 1rem; opacity: 0.9; }
      .ampier-sidebar-close { background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; float: right; margin-bottom: 1rem; }
      .ampier-injected-menu-btn { background: #8b5cf6; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; cursor: pointer; margin: 0.5rem; }
    `;

    // Combine all styles
    const fullCSS = rawCSS + '\n' + inlineCSS;
    let sanitizedCSS = fullCSS
      .replace(/!important/g, '')
      .replace(/@import\s+url\([^)]+\);?/g, '')
      .replace(/@import\s+['"][^'"]+['"];?/g, '')
      .replace(/@property\s+[^{]+\{[^}]*\}/g, '')
      .replace(/@-ms-viewport\s*\{[^}]*\}/gi, '')
      .replace(/@charset\s+[^;]+;/g, '')
      .replace(/\.i-amphtml-[^{]+\{[^}]*\}/gi, '') // Remove internal AMP runtime CSS rules
      .replace(/i-amphtml-[a-z0-9_-]+/gi, '');

    // Flatten @layer and @container blocks to normal CSS rules
    sanitizedCSS = flattenAtRule(sanitizedCSS, '@layer');
    sanitizedCSS = flattenAtRule(sanitizedCSS, '@container');

    // Strip inline base64 fonts and images from CSS to meet 75KB limits
    sanitizedCSS = sanitizedCSS.replace(/url\s*\(\s*['"]?data:font\/[^;]+;base64,[^'")\s]+['"]?\s*\)/g, 'local("sans-serif")');
    sanitizedCSS = sanitizedCSS.replace(/url\s*\(\s*['"]?data:image\/[^;]+;base64,[^'")\s]+['"]?\s*\)/g, 'none');
    sanitizedCSS = sanitizedCSS.replace(/url\s*\(\s*['"]?data:[^'")\s]+['"]?\s*\)/g, 'none');

    // Minify CSS with CSSO
    try {
      const minifiedResult = csso.minify(sanitizedCSS);
      sanitizedCSS = minifiedResult.css;
    } catch (err) {
      logs.push(`CSSO minification warning: ${err.message}`);
    }

    // Truncate CSS safely if >75KB
    const cssSizeLimit = 75000;
    if (sanitizedCSS.length > cssSizeLimit) {
      logs.push(`CSS size (${sanitizedCSS.length} bytes) exceeds AMP limit of 75KB. Truncating to maintain validity.`);
      sanitizedCSS = sanitizedCSS.substring(0, cssSizeLimit - 10);
      const lastBrace = sanitizedCSS.lastIndexOf('}');
      if (lastBrace !== -1) {
        sanitizedCSS = sanitizedCSS.substring(0, lastBrace + 1);
      } else {
        sanitizedCSS += '}';
      }
    }

    // 7. Strip prohibited elements & attributes
    $('font, embed, object, applet, frame, frameset').remove();
    
    // Rewrite framework-specific custom tags (e.g. app-root, router-outlet, app-home) to standard divs
    const customTagNames = new Set();
    $('*').each((i, el) => {
      const name = el.name;
      if (name && name.includes('-') && !name.startsWith('amp-')) {
        customTagNames.add(name);
      }
    });

    customTagNames.forEach(tagName => {
      $(tagName).each((i, el) => {
        const $el = $(el);
        const div = $('<div></div>');
        const attrs = el.attribs;
        if (attrs) {
          for (const attr in attrs) {
            div.attr(attr, attrs[attr]);
          }
        }
        div.append($el.html());
        $el.replaceWith(div);
      });
    });

    // Strip unsafe dynamic framework attributes and tag-specific violations
    $('*').each((i, el) => {
      const tagName = el.name ? el.name.toLowerCase() : '';
      const attrs = el.attribs;
      if (attrs) {
        Object.keys(attrs).forEach(attr => {
          const attrLower = attr.toLowerCase();
          
          if (!isAttributeSafe(attr)) {
            $(el).removeAttr(attr);
            return;
          }

          if ((tagName === 'div' || tagName === 'span' || tagName === 'button') && (attrLower === 'src' || attrLower === 'href' || attrLower === 'required' || attrLower === 'action' || attrLower === 'method' || attrLower === 'placeholder')) {
            $(el).removeAttr(attr);
          }
        });
      }
    });

    // 8. Reconstruct <head> with AMP boilerplates and metadata
    let head = $('head');
    if (head.length === 0) {
      $('html').prepend('<head></head>');
      head = $('head');
    }

    head.find('meta[charset]').remove();
    head.find('meta[http-equiv]').remove();
    head.find('meta[name="viewport"]').remove();
    head.find('link[rel="canonical"]').remove();

    const existingHeadInner = head.html();
    head.html('<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">\n' + existingHeadInner);

    head.append(`<link rel="canonical" href="${targetUrl}">`);
    head.append('<script async src="https://cdn.ampproject.org/v0.js"></script>');

    // Automatically detect all used AMP components and append extension scripts
    AMP_COMPONENT_SCRIPTS.forEach(comp => {
      if ($(comp.selector).length > 0) {
        if (head.find(`script[${comp.type}="${comp.name}"]`).length === 0) {
          head.append(`<script async ${comp.type}="${comp.name}" src="${comp.url}"></script>`);
        }
      }
    });

    if (sanitizedCSS.trim()) {
      head.append(`<style amp-custom>${sanitizedCSS}</style>`);
    }

    const boilerplate = `<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>`;
    head.append(boilerplate);

    // Initial HTML serialization
    ampHtml = $.html();
    ampHtml = ampHtml.replace(/<html([^>]*)\s+amp=""/gi, '<html$1 ⚡');
    ampHtml = ampHtml.replace(/<html([^>]*)\s+amp(\s|>)/gi, '<html$1 ⚡$2');

    // Guarantee <meta charset="utf-8"> is the absolute 1st child inside <head>
    ampHtml = ampHtml.replace(/<head[^>]*>/i, '$&\n<meta charset="utf-8">');

    if (!ampHtml.trim().toLowerCase().startsWith('<!doctype html>')) {
      ampHtml = '<!doctype html>\n' + ampHtml;
    }

    // 9. Self-Healing Auto-Correction Pass
    // Runs validator and uses feedback to programmatically fix remaining edge-case errors
    logs.push('Entering AMP Self-Healing Auto-Correction Loop...');
    const validatorInstance = await amphtmlValidator.getInstance();
    
    let currentAttempt = 0;
    const maxAttempts = 3;

    while (currentAttempt < maxAttempts) {
      currentAttempt++;
      const result = validatorInstance.validateString(ampHtml);

      validationResult = {
        status: result.status,
        errors: result.errors.map(err => ({
          severity: err.severity,
          line: err.line,
          col: err.col,
          message: err.message,
          specUrl: err.specUrl || null
        }))
      };

      if (result.status === 'PASS' || result.errors.length === 0) {
        logs.push(`Self-Healing Loop: Validated 100% PASS on attempt ${currentAttempt}`);
        break;
      }

      logs.push(`Validation Attempt ${currentAttempt}: ${result.errors.length} error(s) found. Auto-healing...`);
      const $heal = cheerio.load(ampHtml);
      let healedCount = 0;

      result.errors.forEach(err => {
        const msg = err.message;

        // Auto-heal 1: Disallowed tag
        const tagMatch = msg.match(/The tag '([^']+)' is disallowed/i);
        if (tagMatch) {
          const badTag = tagMatch[1].toLowerCase();
          if (badTag !== 'html' && badTag !== 'head' && badTag !== 'body') {
            $heal(badTag).each((i, el) => {
              const $el = $heal(el);
              const div = $heal('<div></div>');
              div.append($el.html());
              $el.replaceWith(div);
              healedCount++;
            });
          }
        }

        // Auto-heal 2: Disallowed attribute
        const attrMatch = msg.match(/The attribute '([^']+)' (?:may not appear in tag|is disallowed)/i);
        if (attrMatch) {
          const badAttr = attrMatch[1];
          if (badAttr && badAttr !== 'src' && badAttr !== 'href') {
            $heal(`[${badAttr}]`).removeAttr(badAttr);
            healedCount++;
          }
        }

        // Auto-heal 3: Disallowed parent/child
        const parentMatch = msg.match(/The parent tag of tag '([^']+)' is '([^']+)', but it can only be/i);
        if (parentMatch) {
          const childTag = parentMatch[1];
          const parentTag = parentMatch[2];
          if (parentTag !== 'head' && parentTag !== 'body' && parentTag !== 'html') {
            $heal(`${parentTag} > ${childTag}`).each((i, el) => {
              $heal(el).unwrap();
              healedCount++;
            });
          }
        }

        // Auto-heal 4: Author stylesheet too long
        if (msg.includes('author stylesheet specified in tag \'style amp-custom\' is too long')) {
          const customStyle = $heal('style[amp-custom]');
          if (customStyle.length > 0) {
            let cssText = customStyle.text();
            cssText = cssText.substring(0, Math.max(5000, cssText.length - 10000));
            const lastBrace = cssText.lastIndexOf('}');
            if (lastBrace !== -1) cssText = cssText.substring(0, lastBrace + 1);
            customStyle.text(cssText);
            healedCount++;
          }
        }

        // Auto-heal 5: Meta tag missing content attribute
        if (msg.includes('mandatory attribute \'content\' is missing in tag \'meta\'')) {
          $heal('meta:not([content])').remove();
          healedCount++;
        }

        // Auto-heal 6: Internal runtime class or CSS prefix
        if (msg.includes('i-amphtml-') || msg.includes('disallowed-styles')) {
          $heal('*[class]').each((i, el) => {
            const cls = $heal(el).attr('class');
            if (cls) {
              const clean = cls.split(/\s+/).filter(c => !c.startsWith('i-amphtml-') && !c.startsWith('-amp-')).join(' ');
              if (clean.trim()) $heal(el).attr('class', clean);
              else $heal(el).removeAttr('class');
            }
          });
          healedCount++;
        }

        // Auto-heal 7: Missing height or width attribute on amp-img or amp-iframe
        if (msg.includes("mandatory attribute 'height' is missing in tag 'amp-img'") || msg.includes("mandatory attribute 'width' is missing in tag 'amp-img'")) {
          $heal('amp-img:not([height])').attr('height', '200');
          $heal('amp-img:not([width])').attr('width', '300');
          healedCount++;
        }
        if (msg.includes("mandatory attribute 'height' is missing in tag 'amp-iframe'") || msg.includes("mandatory attribute 'width' is missing in tag 'amp-iframe'")) {
          $heal('amp-iframe:not([height])').attr('height', '400');
          $heal('amp-iframe:not([width])').attr('width', '600');
          healedCount++;
        }
      });

      if (healedCount === 0) {
        logs.push('Self-healing loop: No further automatic structural edits possible.');
        break;
      }

      // Re-serialize healed HTML
      ampHtml = $heal.html();
      ampHtml = ampHtml.replace(/<html([^>]*)\s+amp=""/gi, '<html$1 ⚡');
      ampHtml = ampHtml.replace(/<html([^>]*)\s+amp(\s|>)/gi, '<html$1 ⚡$2');
      if (!ampHtml.includes('<meta charset="utf-8">') && !ampHtml.includes('<meta charset="UTF-8">')) {
        ampHtml = ampHtml.replace(/<head[^>]*>/i, '$&\n<meta charset="utf-8">');
      }
      if (!ampHtml.trim().toLowerCase().startsWith('<!doctype html>')) {
        ampHtml = '<!doctype html>\n' + ampHtml;
      }
    }

    if (!ampHtml.includes('<meta charset="utf-8">') && !ampHtml.includes('<meta charset="UTF-8">')) {
      ampHtml = ampHtml.replace(/<head[^>]*>/i, '$&\n<meta charset="utf-8">');
    }

  } catch (error) {
    logs.push(`Error during conversion pipeline: ${error.message}`);
    console.error(error);
    if (browser) {
      await browser.close().catch(() => {});
    }
    throw error;
  }

  return {
    ampHtml,
    originalHtml,
    originalSize: originalHtml ? originalHtml.length : 0,
    ampSize: ampHtml ? ampHtml.length : 0,
    validation: validationResult,
    logs
  };
}

/**
 * Recursively flattens CSS blocks of a specific at-rule by removing the wrapper
 * but keeping the nested styles inside.
 * 
 * @param {string} css CSS string to process
 * @param {string} atRule The at-rule string (e.g. '@layer', '@container')
 * @returns {string} Flattened CSS string
 */
function flattenAtRule(css, atRule) {
  let result = '';
  let i = 0;
  while (i < css.length) {
    if (css.substring(i, i + atRule.length) === atRule) {
      const openBraceIdx = css.indexOf('{', i);
      if (openBraceIdx === -1) {
        const semiIdx = css.indexOf(';', i);
        if (semiIdx !== -1) {
          i = semiIdx + 1;
        } else {
          i += atRule.length;
        }
        continue;
      }
      
      let braceCount = 1;
      let j = openBraceIdx + 1;
      let blockContent = '';
      while (j < css.length && braceCount > 0) {
        const char = css[j];
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        
        if (braceCount > 0) {
          blockContent += char;
        }
        j++;
      }
      result += flattenAtRule(blockContent, atRule);
      i = j;
    } else {
      result += css[i];
      i++;
    }
  }
  return result;
}

module.exports = {
  convertUrlToAmp
};
