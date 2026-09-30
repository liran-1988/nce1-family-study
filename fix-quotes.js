const fs = require("fs");
for (let f = 1; f <= 4; f++) {
  const p = `grammar-b${f}.json`;
  const s = fs.readFileSync(p, "utf8");
  let out = "", inStr = false, open = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!inStr) {
      if (c === '"') { inStr = true; open = false; }
      out += c;
    } else if (c === "\\") {
      out += c + (s[i + 1] ?? ""); i++;
    } else if (c === '"') {
      let j = i + 1; while (s[j] === " ") j++;
      if (",;:}]".includes(s[j])) { inStr = false; out += c; }
      else { out += open ? "”" : "“"; open = !open; }
    } else out += c;
  }
  fs.writeFileSync(p, out);
  try { JSON.parse(fs.readFileSync(p, "utf8")); console.log(`${p}: JSON OK`); }
  catch (e) { console.log(`${p}: STILL BROKEN -> ${e.message.slice(0, 100)}`); process.exitCode = 1; }
}
