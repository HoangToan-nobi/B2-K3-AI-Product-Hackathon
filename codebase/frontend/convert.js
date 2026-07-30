/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');

const indexHtml = fs.readFileSync('../frontend-old/index.html', 'utf-8');

// Extract CSS
const cssMatch = indexHtml.match(/<style>([\s\S]*?)<\/style>/);
if (cssMatch) {
  let cssContent = `@import "tailwindcss";\n\n` + cssMatch[1];
  fs.writeFileSync('./src/app/globals.css', cssContent);
}

// Extract JS data and convert to React
// This requires rewriting the React component. I will write it directly below.
