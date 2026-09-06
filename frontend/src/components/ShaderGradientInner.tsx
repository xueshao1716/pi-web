// ShaderGradientInner —— GradientField 的懒加载实现块（2026-09-03）
// 只有这个文件 import @shadergradient/react（内含 three），被 React.lazy 切成独立 chunk，
// 进入欢迎页空态时才下载；深色科技风参数：深海蓝 → 紫罗兰 → 青，慢速流动，低噪声。
// pixelDensity=1 控制分辨率换性能；frameloop 随浏览器 rAF，页签隐藏自动暂停。
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react'

export default function ShaderGradientInner() {
  return (
    <div className="absolute inset-0" style={{ opacity: 0.42 }}>
      <ShaderGradientCanvas style={{ width: '100%', height: '100%' }} pixelDensity={1}>
        <ShaderGradient
          type="plane"
          color1="#141428"
          color2="#3d2c8d"
          color3="#0e7490"
          animate="on"
          uSpeed={0.22}
          uAmplitude={1.1}
          uFrequency={1.4}
          uDensity={0.9}
          lightType="3d"
        />
      </ShaderGradientCanvas>
    </div>
  )
}
