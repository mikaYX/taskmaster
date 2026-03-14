const fs = require('fs');
const path = require('path');

function getFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFiles(file));
        } else {
            if (file.endsWith('.tsx') || file.endsWith('.ts')) results.push(file);
        }
    });
    return results;
}

const files = getFiles('src');
const fallbacks = [];

files.forEach(f => {
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
        // match t('key', 'fallback') or t("key", "fallback")
        // make sure it starts with t(, not set( or get( etc
        const regex = /(?:^|[^\w])t\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]\s*\)/g;
        let m;
        while ((m = regex.exec(line)) !== null) {
            fallbacks.push({ file: f, line: i + 1, key: m[1], fb: m[2] });
        }
    });
});

console.log(JSON.stringify(fallbacks, null, 2));
