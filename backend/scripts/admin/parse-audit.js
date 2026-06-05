const a = require("./audit.json");
for (const key of Object.keys(a.vulnerabilities || {})) {
    const v = a.vulnerabilities[key];
    console.log(`${key}: ${v.severity}, ${v.fixAvailable}`);
}
