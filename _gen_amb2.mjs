import fs from 'node:fs';

const TOKEN = "love#1126469194";
const SRC = 'D:/pi-workspace/收发文件/2026-08-08/mmexport1786186806972.jpg';
const OUT = 'D:/pi-workspace/工程/八宝川-河桥镇/images/';
const imgB64 = fs.readFileSync(SRC).toString('base64');

const LOCK = "CRITICAL: Preserve the EXACT same woman from the reference photo. Her face must be identical: same face shape, same eyes, same nose, same lips, same eyebrows, same hairstyle, same facial proportions. ABSOLUTELY DO NOT change, reshape, beautify or alter any facial feature. Do not make her look younger, slimmer or different. Only slight natural skin texture smoothing and soft flattering lighting. ";

const jobs = [
  ['amb-v1-hero', '1472x832',
    LOCK + "She stands elegantly as a tourism ambassador, graceful natural pose, gentle warm smile, wearing an elegant refined outfit. Background: beautiful Datong River valley in Gansu with layered green mountains, misty river, golden morning light, cinematic. Professional portrait photography, magazine quality, ultra detailed. no text, no watermark"],
  ['amb-v2', '832x1472',
    LOCK + "Three-quarter elegant portrait, graceful natural posture, soft confident smile, refined clothing. Background: soft-focus misty mountains and river in warm golden light. Professional studio portrait, cinematic soft lighting, ultra detailed, natural. no text, no watermark"],
  ['amb-v3-hero', '1472x832',
    LOCK + "Full-body elegant standing pose beside the river, facing camera, graceful and poised, wearing a beautiful elegant long dress. Background: wide scenic view of the Datong River valley, emerald water, green Qilian mountains, sunrise glow. High-end travel photography, ultra detailed, natural colors. no text, no watermark"],
];

for (const [tag, size, prompt] of jobs) {
  const body = JSON.stringify({ provider: 'agnes', modelId: 'agnes-image-2.1-flash', prompt, size, image: imgB64 });
  const t0 = Date.now();
  try {
    const r = await fetch('http://127.0.0.1:8787/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body
    });
    const d = await r.json();
    console.log('[' + tag + '] ' + ((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(d).slice(0, 150));
    if (d.image) {
      let u = d.image;
      if (u.startsWith('/api/')) u = 'http://127.0.0.1:8787' + u;
      const res = await fetch(u);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(OUT + tag + '.jpg', buf);
      console.log('  -> ' + tag + '.jpg saved ' + (buf.length / 1024).toFixed(0) + 'KB');
    }
  } catch (e) {
    console.log('[' + tag + '] FAIL', e.message);
  }
  await new Promise(r => setTimeout(r, 1500));
}
console.log('DONE');
