import urllib.request, json, time, os, urllib.parse
TOKEN = "love#1126469194"
OUT = r"D:\pi-workspace\工程\八宝川-河桥镇\images"
os.makedirs(OUT, exist_ok=True)

def gen(provider, modelId, prompt, size="1024x1024", tag=""):
    body = json.dumps({"provider":provider,"modelId":modelId,"prompt":prompt,"size":size}).encode()
    req = urllib.request.Request("http://127.0.0.1:8787/api/image", data=body,
        headers={"Content-Type":"application/json","Authorization":"Bearer "+TOKEN})
    t0=time.time()
    try:
        r = urllib.request.urlopen(req, timeout=300)
        d = json.loads(r.read().decode())
        print(f"[{tag}] {int(time.time()-t0)}s OK: {str(d.get('image'))[:110]}", flush=True)
        return d.get("image")
    except Exception as e:
        print(f"[{tag}] FAIL {int(time.time()-t0)}s: {e}", flush=True)
        return None

def download(url, name):
    if not url: return False
    dest = os.path.join(OUT, name)
    # URL 可能是相对 /api/ws/file?... → 拼本地；也可能是 http(s) 外链
    if url.startswith("/api/"):
        url = "http://127.0.0.1:8787" + url
    py = "import urllib.request,sys; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])"
    for attempt in range(2):
        try:
            import subprocess
            subprocess.run(["python","-c",py,url,dest], check=True, timeout=120)
            sz = os.path.getsize(dest)
            print(f"  → {name} saved {sz//1024}KB", flush=True)
            return sz > 5000
        except Exception as e:
            print(f"  ✗ dl fail {attempt}: {e}", flush=True)
    return False

NT = "no text, no words, no watermark, no caption, no logo, no people in foreground"

# ── minimax 重出 3 张（被覆盖丢失的）──
MM = ("minimax", "image-01")
jobs = [
 ("river","1472x832","Photorealistic wide-angle landscape photograph of the Datong River flowing through the Babao Valley in Gansu, China. Emerald-green river water winding between steep green mountains, riverside road and old bridge, a small riverside town with white buildings along the bank, clear blue sky with soft clouds, lush trees, fresh vivid natural scenery, high-definition travel photography, cinematic, ultra detailed. "+NT),
 ("tusi","1024x1024","Photorealistic architectural photograph of a well-preserved ancient Ming Dynasty Tusi chieftain mansion complex in northwest China. Grand traditional Chinese official-style courtyard buildings with gray-tile roofs, red walls, intricate dougong brackets and upturned eaves, stone lion at the gate, old cobblestone square in front, clear daylight, historical heritage site, high quality architectural photography, no people. "+NT),
 ("temple","1024x1024","Photorealistic photograph of a Tibetan Buddhist Gelug monastery in a river valley in northwest China. White stupa chorten, colorful prayer flags fluttering, golden rooftop ornaments, red and white monastery walls, prayer wheels, snow-capped Qilian mountains in background, bright blue sky, serene spiritual atmosphere, travel photography, ultra detailed. "+NT),
]
for tag, size, prompt in jobs:
    u = gen(*MM, prompt, size, tag)
    download(u, tag + ".jpg")
    time.sleep(1)

# ── Z-Image-Turbo 免费 4 张 ──
ZZ = ("modelscope", "Tongyi-MAI/Z-Image-Turbo")
zj = [
 ("tu","1024x1024","Photorealistic photograph of Tu ethnic minority culture in northwest China. A Tu woman in traditional colorful embroidered ethnic costume with embroidered hat, smiling, standing in a sunlit courtyard of an old village, traditional mud-brick houses with gray roofs behind her, warm golden light, authentic cultural documentary photography, no people in foreground text. "+NT),
 ("food","1024x1024","Photorealistic overhead food photography of authentic northwest Chinese farmhouse cuisine on a rustic wooden table: cold noodles 酿皮 with chili oil, sweet fermented barley drink 甜醅, red dates and grains, wild mushroom stir-fry, fresh seasonal vegetables, traditional bowls and steam rising, warm cozy lighting, appetizing, professional food photography, no text no labels. "+NT),
 ("night","1472x832","Photorealistic astrophotography of the Milky Way galaxy over a mountain river valley at night in northwest China. A winding river reflecting starlight, silhouette of mountains and a small bridge, deep blue night sky full of stars and faint aurora-like glow, long exposure, breathtaking, no light pollution, ultra detailed. "+NT),
 ("flowers","1024x1024","Photorealistic landscape photograph of an alpine meadow in May in the Qilian Mountains, Gansu, China. Colorful wildflowers in full bloom (yellow, purple, white) on a green meadow, grazing sheep and yaks, snow patches on distant peaks, blue sky with white clouds, fresh spring atmosphere, vibrant natural scenery, travel photography, ultra detailed. "+NT),
]
for tag, size, prompt in zj:
    u = gen(*ZZ, prompt, size, tag)
    download(u, tag + ".jpg")
    time.sleep(1)

print("ALL DONE")
