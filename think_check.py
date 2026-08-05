# -*- coding: utf-8 -*-
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        page = await b.new_page(viewport={'width': 1440, 'height': 900})
        await page.goto('http://127.0.0.1:8787/?token=love%231126469194', wait_until='networkidle', timeout=30000)
        await page.wait_for_timeout(2500)
        # 打开当前会话（你是哪个模型，有大量思考）
        await page.evaluate("""
          () => { const items = document.querySelectorAll('#session-list [class*=session]');
            for (const it of items) { if (it.textContent.includes('你是哪个模型')) { it.click(); break; } } }
        """)
        await page.wait_for_timeout(5000)
        info = await page.evaluate("""
          () => {
            const tb = document.querySelectorAll('.think-block');
            const tools = document.querySelectorAll('.tool');
            const msgs = document.querySelectorAll('.msg.assistant');
            // 检查前几个 think-block 的折叠状态和位置
            const first = tb[0];
            let firstState = null;
            if (first) {
              const r = first.getBoundingClientRect();
              firstState = { collapsed: first.classList.contains('collapsed'), top: Math.round(r.top), h: Math.round(r.height), visible: r.height > 5 };
            }
            return {
              thinkCount: tb.length, toolCount: tools.length, msgCount: msgs.length,
              firstThink: firstState,
              // 检查 #messages 里前 8 个直接子元素的 class 顺序
              order: Array.from(document.querySelector('#messages').children).slice(0, 8).map(e => e.className.split(' ')[0]),
            };
          }
        """)
        print('web 端:', info)
        await page.screenshot(path='/tmp/think-web.png')
        # 手机端
        await page.setViewportSize({'width': 390, 'height': 844})
        await page.wait_for_timeout(1500)
        info2 = await page.evaluate("""
          () => {
            const tb = document.querySelectorAll('.think-block');
            const first = tb[0];
            const r = first ? first.getBoundingClientRect() : null;
            return { thinkCount: tb.length, firstVisible: r ? Math.round(r.height) > 5 : null, firstH: r ? Math.round(r.height) : null };
          }
        """)
        print('手机端:', info2)
        await page.screenshot(path='/tmp/think-mobile.png')
        await b.close()

asyncio.run(main())
