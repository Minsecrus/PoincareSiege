# Poincaré Siege

Three.js 场景原型：在曲率 `K = -1` 的 Poincaré 圆盘中显示正则 `{7,3}` 双曲镶嵌、中央基地和七条测地入侵线。

## 本地运行

```powershell
npm install
npm run dev
```

默认地址为 <http://127.0.0.1:5173>。

## 操作

- `WASD`：通过 Möbius 等距变换移动双曲视点
- 鼠标左键：点击第一、第二圈空格打开建塔列表；点击已有塔升级或拆除
- 鼠标左键点击基地：使用技能点升级生命、回血与双曲半径范围攻击
- 鼠标滚轮：调整观察高度
- `R`：重置视点

## 验证

```powershell
npm run typecheck
npm test
```
