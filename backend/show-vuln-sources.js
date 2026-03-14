const a = require('./audit.json');
Object.keys(a.vulnerabilities).forEach(k => {
    const via = a.vulnerabilities[k].via;
    const sources = (via || []).map(v => typeof v === 'string' ? v : v.source).join(', ');
    console.log(`${k}: ${sources}`);
});
