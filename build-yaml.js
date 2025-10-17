import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const dir = './public';
for (const file of fs.readdirSync(dir)) {
  if (file.endsWith('.yaml')) {
    const yamlPath = path.join(dir, file);
    const jsonPath = yamlPath.replace(/\.yaml$/, '.json');
    const kvJsonPath = path.join(dir, 'keyValue.json');

    const data = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`✅ Converted ${file} → ${path.basename(jsonPath)}`);

    // 生成 keyValue.json
    const kv = {};
    for (const item of data) {
      if (!item.name || !item.bgmId || item.bgmId.length === 0) continue;
      kv[item.name] = String(item.bgmId[0]);
    }
    fs.writeFileSync(kvJsonPath, JSON.stringify(kv, null, 2));
    console.log(`✅ Generated keyValue.json`);
  }
}
