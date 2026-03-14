const a = require("./audit.json");
console.log(JSON.stringify(a.vulnerabilities["@jest/core"], null, 2));
console.log(JSON.stringify(a.vulnerabilities["jest-cli"], null, 2));
