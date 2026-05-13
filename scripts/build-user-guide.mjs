import { marked } from 'marked';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const md = fs.readFileSync(path.join(root, 'USER_GUIDE.md'), 'utf-8');
const body = await marked.parse(md);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TicketCraft — User Guide</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      max-width: 860px;
      margin: 2rem auto;
      padding: 0 1.5rem 4rem;
      color: #1f2937;
      line-height: 1.7;
      background: #f9fafb;
    }
    h1 { font-size: 2rem; border-bottom: 2px solid #e5e7eb; padding-bottom: .5rem; margin-top: 2.5rem; }
    h2 { font-size: 1.4rem; margin-top: 2.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: .3rem; }
    h3 { font-size: 1.15rem; margin-top: 1.8rem; }
    h4 { font-size: 1rem; margin-top: 1.4rem; }
    a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
    a:hover { color: #1d4ed8; }
    code {
      background: #f3f4f6;
      padding: .15em .4em;
      border-radius: 4px;
      font-size: .88em;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    }
    pre {
      background: #1e293b;
      color: #e2e8f0;
      padding: 1rem 1.25rem;
      border-radius: 8px;
      overflow-x: auto;
      font-size: .88em;
      line-height: 1.6;
    }
    pre code { background: none; padding: 0; color: inherit; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #d1d5db; padding: .5rem .75rem; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    tr:nth-child(even) { background: #f9fafb; }
    blockquote {
      border-left: 4px solid #3b82f6;
      margin: 1rem 0;
      padding: .5rem 1rem;
      color: #4b5563;
      background: #eff6ff;
      border-radius: 0 6px 6px 0;
    }
    ul, ol { padding-left: 1.5rem; }
    li { margin: .3rem 0; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0; }
    img { max-width: 100%; border-radius: 8px; }
    .back-link {
      display: inline-block;
      margin-bottom: 1rem;
      color: #6b7280;
      text-decoration: none;
      font-size: .9rem;
    }
    .back-link:hover { color: #2563eb; }
  </style>
</head>
<body>
  <a class="back-link" href="/">← Back to TicketCraft</a>
  ${body}
</body>
</html>`;

const outDir = path.join(root, 'client', 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'user-guide.html'), html);
console.log('✓ user-guide.html written to client/public/');
