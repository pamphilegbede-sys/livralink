/**
 * Utilitaires d'échappement et de nettoyage HTML défensif pour l'aperçu des e-mails.
 * Empêche toute exécution de scripts ou injection de contenu actif lors du rendu
 * d'aperçus HTML archivés.
 */

export function escapeHtmlText(unsafe: unknown): string {
  if (typeof unsafe !== 'string') {
    return String(unsafe ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BLOCKED_TAG_BLOCKS_REGEX =
  /<\s*(script|style|iframe|frame|frameset|object|embed|applet|form|input|button|textarea|select|option|meta|link|base|svg|math|noscript|template)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

const BLOCKED_SINGLE_TAGS_REGEX =
  /<\s*\/?\s*(script|style|iframe|frame|frameset|object|embed|applet|form|input|button|textarea|select|option|meta|link|base|svg|math|noscript|template)\b[^>]*>/gi;

export function sanitizeEmailPreviewHtml(rawHtml: unknown): string {
  if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
    return '';
  }

  let cleaned = rawHtml
    // Supprimer les commentaires HTML conditionnels ou malveillants
    .replace(/<!--[\s\S]*?-->/g, '')
    // Supprimer entièrement les blocs de balises dangereuses (avec leur contenu)
    .replace(BLOCKED_TAG_BLOCKS_REGEX, '')
    // Supprimer les balises dangereuses auto-fermantes ou orphelines
    .replace(BLOCKED_SINGLE_TAGS_REGEX, '')
    // Supprimer les attributs événementiels inline (onclick, onerror, onload, etc.)
    .replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Supprimer srcdoc / formaction
    .replace(/\s+(?:srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Neutraliser les schémas dangereux dans href / src / action / xlink:href / poster
    .replace(
      /(\b(?:href|src|action|xlink:href|poster)\s*=\s*)(["'])\s*(?:javascript|vbscript|data\s*:\s*(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)|file)\b[\s\S]*?\2/gi,
      '$1$2#$2'
    )
    .replace(
      /(\b(?:href|src|action|xlink:href|poster)\s*=\s*)(?:javascript|vbscript|data\s*:\s*(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)|file):[^\s>]*/gi,
      '$1"#"'
    )
    // Neutraliser les expressions CSS et url(javascript:...) dans style="..."
    .replace(/expression\s*\([^)]*\)/gi, 'none')
    .replace(/-moz-binding\s*:[^;"']*/gi, '')
    .replace(/url\(\s*(['"]?)\s*(?:javascript|vbscript|data\s*:\s*(?:text\/html|image\/svg\+xml))[^)]*\)/gi, 'none');

  // Deuxième passe au cas où une balise imbriquée serait reconstruite après suppression
  cleaned = cleaned
    .replace(BLOCKED_TAG_BLOCKS_REGEX, '')
    .replace(BLOCKED_SINGLE_TAGS_REGEX, '')
    .replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  return cleaned;
}

export function buildSandboxedEmailPreviewDocument(rawHtml: unknown): string {
  const safeBody = sanitizeEmailPreviewHtml(rawHtml);
  return [
    '<!DOCTYPE html>',
    '<html lang="fr">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'; font-src https: data:;" />',
    '<style>html,body{margin:0;padding:8px;background:#ffffff;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;word-break:break-word;}img{max-width:100%;height:auto;}</style>',
    '</head>',
    `<body>${safeBody}</body>`,
    '</html>',
  ].join('');
}
