/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const { minify: minifyHtml } = require('html-minifier-terser');
const { minify: minifyJs } = require('terser');
const CleanCSS = require('clean-css');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const DIST_CSS = path.join(DIST, 'css');
const DIST_JS = path.join(DIST, 'js');
const DIST_ASSETS = path.join(DIST, 'assets');
const DIST_IMG = path.join(DIST_ASSETS, 'img');

const SRC_HTML = path.join(ROOT, 'index.html');
const SRC_IMG = path.join(ROOT, 'img');

const CANONICAL_URL = 'https://pos.personaltraineracademy.com.br/';
const REQUIRED_WEBHOOK_URL =
  'https://hook.us1.make.com/bhigavwc6bfhskmnicov25r6jv9fnt1p?produto=BB5';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ensureHeadTag(html, testRegex, tag) {
  if (testRegex.test(html)) return html;
  return html.replace('</head>', `${tag}</head>`);
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function normalizeAssetRefs(html) {
  // Saída final usa dist/assets/img para imagens locais do projeto.
  let out = html;
  out = out.replace(/(src|href)=(["'])\.?\/?assets\//g, '$1=$2assets/img/');
  out = out.replace(/(srcset)=["']\.?\/?assets\//g, '$1="assets/img/');
  out = out.replace(/url\((["']?)\.?\/?assets\//g, 'url($1assets/img/');
  out = out.replace(/(src|href)=(["'])\.\/img\//g, '$1=$2assets/img/');
  out = out.replace(/(srcset)=["']\.\/img\//g, '$1="assets/img/');
  out = out.replace(/url\((["']?)\.\/img\//g, 'url($1assets/img/');
  out = out.replace(/(src|href)=(["'])img\//g, '$1=$2assets/img/');
  out = out.replace(/(src|href)=(["'])\/img\//g, '$1=$2assets/img/');
  out = out.replace(/url\((["']?)img\//g, 'url($1assets/img/');
  out = out.replace(/url\((["']?)\/img\//g, 'url($1assets/img/');
  return out;
}

function fillMissingAlt(html) {
  let out = html.replace(
    /<img([^>]*?)alt=(["'])\s*\2([^>]*?)>/gi,
    '<img$1alt="Imagem da página Bodybuilding"$3>'
  );

  out = out.replace(/<img((?:(?!\salt=)[^>])*)>/gi, '<img$1 alt="Imagem da página Bodybuilding">');
  return out;
}

function getTitle(html) {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match ? match[1].trim() : 'Pós-Graduação em Bodybuilding e Estética Corporal';
}

function enforceWebhookUrl(jsCode) {
  return jsCode.replace(
    /const\s+WEBHOOK_URL\s*=\s*(['"`])[\s\S]*?\1\s*;/,
    `const WEBHOOK_URL = '${REQUIRED_WEBHOOK_URL}';`
  );
}

async function maybeConvertImagesToWebpAndRewrite(html) {
  let sharp = null;
  try {
    sharp = require('sharp');
  } catch (_) {
    return html;
  }

  const imageExtRegex = /\.(png|jpe?g)$/i;
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  }

  walk(DIST_IMG);

  for (const file of files) {
    if (!imageExtRegex.test(file)) continue;
    const basename = path.basename(file).toLowerCase();
    if (basename === 'walter.png' || basename === 'walter20mobile.png') continue;

    const webpPath = file.replace(imageExtRegex, '.webp');
    try {
      await sharp(file).webp({ quality: 82, effort: 5 }).toFile(webpPath);
      const from = path.relative(DIST, file).split(path.sep).join('/');
      const to = path.relative(DIST, webpPath).split(path.sep).join('/');
      const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp(escaped, 'g'), to);
    } catch (error) {
      console.warn(`[build] Falha ao converter ${file} para webp: ${error.message}`);
    }
  }

  return html;
}

function enforceHeroBackgroundImage(html) {
  // Garante que a hero no build use a imagem de background definida em desenvolvimento.
  const heroBackground = 'assets/img/bgHero-DEdxdqbG.webp';

  return html.replace(
    /<img([^>]*?)src=(["'])(?:\.\/)?assets\/img\/(?:WALTER20MOBILE\.png|WALTER\.png|bgHero-[^"']+\.(?:webp|png|jpe?g))\2([^>]*?)>/gi,
    `<img$1src="${heroBackground}"$3>`
  );
}

async function run() {
  if (!fs.existsSync(SRC_HTML)) throw new Error('index.html não encontrado.');
  if (!fs.existsSync(SRC_IMG)) throw new Error('Diretório img não encontrado.');

  fs.rmSync(DIST, { recursive: true, force: true });
  ensureDir(DIST_CSS);
  ensureDir(DIST_JS);
  ensureDir(DIST_ASSETS);
  ensureDir(DIST_IMG);

  copyRecursive(SRC_IMG, DIST_IMG);

  let html = readText(SRC_HTML);

  // Extrai CSS inline.
  let inlineCss = '';
  html = html.replace(/<style>([\s\S]*?)<\/style>/gi, (_, css) => {
    inlineCss += `${css}\n`;
    return '';
  });

  const minCss = new CleanCSS({ level: 2 }).minify(inlineCss).styles || inlineCss;
  writeText(path.join(DIST_CSS, 'style.css'), minCss);

  // Extrai scripts inline exceto blocos de terceiros e configuração do Tailwind CDN.
  let bundledJs = '';
  html = html.replace(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, code) => {
    const scriptCode = String(code || '');
    const isThirdParty =
      /googletagmanager|meta.*pixel|gtag\(|analytics|fbq\(/i.test(scriptCode);
    const isTailwindConfig = /tailwind\.config/i.test(scriptCode);

    if (isThirdParty || isTailwindConfig) return full;
    if (!scriptCode.trim()) return '';

    bundledJs += `${scriptCode}\n`;
    return '';
  });

  if (bundledJs.trim()) {
    bundledJs = enforceWebhookUrl(bundledJs);
    const jsMin = await minifyJs(bundledJs, {
      compress: true,
      mangle: true,
      format: { comments: false },
    });
    writeText(path.join(DIST_JS, 'main.js'), jsMin.code || bundledJs);
    html = html.replace('</body>', '<script src="js/main.js" defer></script></body>');
  }

  // Atualiza caminho de CSS para build final.
  html = html.replace(/<link[^>]+href=["'][^"']*output\.css[^"']*["'][^>]*>/i, '');
  html = ensureHeadTag(html, /href=["']css\/style\.css["']/i, '<link rel="stylesheet" href="css/style.css">');

  // SEO técnico e social.
  const title = getTitle(html);
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["'][^>]*>/i);
  const description = descMatch
    ? descMatch[1]
    : 'Pós-graduação em Bodybuilding e Estética Corporal reconhecida pelo MEC.';
  const ogImage = `${CANONICAL_URL}assets/img/og-image.webp`;

  html = ensureHeadTag(
    html,
    /<link\s+rel=["']canonical["']/i,
    `<link rel="canonical" href="${CANONICAL_URL}">`
  ).replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${CANONICAL_URL}">`);

  html = ensureHeadTag(
    html,
    /<meta\s+property=["']og:title["']/i,
    `<meta property="og:title" content="${escapeAttr(title)}">`
  );
  html = ensureHeadTag(
    html,
    /<meta\s+property=["']og:description["']/i,
    `<meta property="og:description" content="${escapeAttr(description)}">`
  );
  html = ensureHeadTag(
    html,
    /<meta\s+property=["']og:image["']/i,
    `<meta property="og:image" content="${escapeAttr(ogImage)}">`
  );
  html = ensureHeadTag(
    html,
    /<meta\s+property=["']og:url["']/i,
    `<meta property="og:url" content="${CANONICAL_URL}">`
  );
  html = ensureHeadTag(
    html,
    /<meta\s+name=["']twitter:card["']/i,
    '<meta name="twitter:card" content="summary_large_image">'
  );
  html = ensureHeadTag(
    html,
    /<meta\s+name=["']twitter:title["']/i,
    `<meta name="twitter:title" content="${escapeAttr(title)}">`
  );
  html = ensureHeadTag(
    html,
    /<meta\s+name=["']twitter:description["']/i,
    `<meta name="twitter:description" content="${escapeAttr(description)}">`
  );
  html = ensureHeadTag(
    html,
    /<meta\s+name=["']twitter:image["']/i,
    `<meta name="twitter:image" content="${escapeAttr(ogImage)}">`
  );

  html = ensureHeadTag(
    html,
    /rel=["']preconnect["'][^>]*cdnjs\.cloudflare\.com/i,
    '<link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>'
  );
  html = ensureHeadTag(
    html,
    /rel=["']preconnect["'][^>]*unpkg\.com/i,
    '<link rel="preconnect" href="https://unpkg.com" crossorigin>'
  );

  html = fillMissingAlt(html);
  html = normalizeAssetRefs(html);
  html = enforceHeroBackgroundImage(html);
  html = await maybeConvertImagesToWebpAndRewrite(html);

  const htmlMin = await minifyHtml(html, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    useShortDoctype: true,
    minifyCSS: false,
    minifyJS: false,
    keepClosingSlash: true,
  });

  writeText(path.join(DIST, 'index.html'), htmlMin);
  console.log('[build] dist/ gerado com sucesso.');
}

run().catch((error) => {
  console.error('[build] erro:', error);
  process.exitCode = 1;
});
