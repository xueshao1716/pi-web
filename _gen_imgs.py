import urllib.request, json, time, sys
TOKEN = "love#1126469194"
def gen(provider, modelId, prompt, size="1024x1024", tag=""):
    body = json.dumps({"provider":provider,"modelId":modelId,"prompt":prompt,"size":size}).encode()
    req = urllib.request.Request("http://127.0.0.1:8787/api/image", data=body,
        headers={"Content-Type":"application/json","Authorization":"Bearer "+TOKEN})
    t0=time.time()
    try:
        r = urllib.request.urlopen(req, timeout=300)
        d = json.loads(r.read().decode())
        print(f"[{tag}] {int(time.time()-t0)}s OK: {str(d.get('image'))[:120]}", flush=True)
        return d.get("image")
    except Exception as e:
        print(f"[{tag}] FAIL {int(time.time()-t0)}s: {e}", flush=True)
        return None

NT = "no text, no words, no watermark, no caption, no logo, no people in foreground"

# ── minimax 主力 6 张（hero 已出，再补 5）──
MM = ("minimax", "image-01")
jobs = [
 ("river","1472x832","Photorealistic wide-angle landscape photograph of the Datong River (大通河) flowing through the Babao Valley in Gansu, China. Emerald-green river water winding between steep green mountains, riverside road and old bridge, a small riverside town with white buildings along the bank, clear blue sky with soft clouds, lush trees, fresh and vivid natural scenery, high-definition travel photography, cinematic, ultra detailed. "+NT),
 ("forest","1024x1024","Photorealistic photograph of a pristine alpine forest gorge in the Qilian Mountains, Gansu, China. Ancient tall spruce and pine forest, a clear mountain stream with mossy rocks, shafts of sunlight through the canopy, wildflowers by the water, deep green tones, misty atmosphere, tranquil national-park scenery, ultra detailed nature photography. "+NT),
 ("tusi","1024x1024","Photorealistic architectural photograph of a well-preserved ancient Ming Dynasty Tusi chieftain mansion complex in northwest China. Grand traditional Chinese official-style courtyard buildings with gray-tile roofs, red walls, intricate dougong brackets and upturned eaves, stone lion at the gate, old cobblestone square in front, clear daylight, historical heritage site, high quality architectural photography, no people. "+NT),
 ("temple","1024x1024","Photorealistic photograph of a Tibetan Buddhist Gelug monastery in a river valley in northwest China. White stupa (chorten), prayer flags fluttering in the wind, golden rooftop ornaments, red and white monastery walls, prayer wheels, snow-capped Qilian mountains in the background, bright blue sky, serene spiritual atmosphere, travel photography, ultra detailed. "+NT),
 ("autumn","1472x832","Photorealistic panoramic landscape photograph of the Datong River valley in autumn, Gansu, China. Layers of golden-yellow and red autumn forest on both sides of a winding river, morning mist over the water, soft warm sunlight, colorful hillsides, spectacular fall colors, cinematic travel photography, ultra detailed. "+NT),
]
results = {}
for tag, size, prompt in jobs:
    url = gen(*MM, prompt, size, tag)
    results[tag] = url
    time.sleep(1)
json.dump(results, open("_gen1.json","w"), ensure_ascii=False)
print("DONE1:", json.dumps(results, ensure_ascii=False)[:500])
