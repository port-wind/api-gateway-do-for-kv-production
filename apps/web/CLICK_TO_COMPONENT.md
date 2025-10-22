# React Dev Inspector - 开发工具

## 🎯 功能说明

在开发模式下，你可以直接在浏览器中点击任何 React 组件元素，自动在 Cursor/VS Code 中打开对应的源代码文件！

## 🚀 如何使用

### 1️⃣ **启动开发服务器**

```bash
npm run dev
# 或
pnpm dev
```

### 2️⃣ **激活检查器模式**

在浏览器中：

#### macOS:
- 按 **`Ctrl + Shift + Command + C`**

#### Windows/Linux:
- 按 **`Ctrl + Shift + Alt + C`**

你会看到屏幕左上角出现一个悬浮的检查器指示器 ✨

### 3️⃣ **点击元素跳转到代码**

激活检查器后：
- 鼠标悬停在任何元素上（会显示高亮边框和组件信息）
- **点击元素**
- 🎉 自动在 Cursor/VS Code 中打开对应的 `.tsx` 文件并定位到对应行！

### 4️⃣ **退出检查器模式**

- 再次按 **`Ctrl + Shift + Command/Alt + C`**
- 或点击屏幕左上角的检查器指示器

## 💡 使用场景

### ✨ 调试复杂 UI
当你想知道某个按钮、对话框或组件是在哪个文件中定义的：
1. 按 `Ctrl + Shift + Cmd/Alt + C` 激活检查器
2. 点击该元素
3. 立即跳转到源代码

### 🔍 快速定位组件
在大型项目中快速找到组件位置：
- 激活检查器 → 点击导航栏 → 找到 `Navigation.tsx`
- 激活检查器 → 点击对话框 → 找到 `Dialog.tsx`
- 激活检查器 → 点击表格行 → 找到 `Table.tsx`

### 🐛 定位问题代码
当 UI 出现问题时：
1. 在页面上找到有问题的元素
2. 按快捷键激活检查器
3. 点击元素直接跳转到代码

## 🎨 视觉提示

- 激活检查器后，屏幕左上角会显示一个悬浮指示器
- 鼠标悬停的元素会显示高亮边框和信息卡片
- 信息卡片包含：组件名称、文件路径、代码行号
- 边框颜色会根据主题自动调整

## ⚙️ 配置（可选）

### 自定义快捷键

可以在 `main.tsx` 中修改激活快捷键：

```tsx
{import.meta.env.DEV && (
  <Inspector
    keys={['control', 'shift', 'command', 'c']}  // macOS
    // 或 keys={['control', 'shift', 'alt', 'c']}  // Windows/Linux
    disableLaunchEditor={false}
  />
)}
```

### 其他配置选项

```tsx
<Inspector
  // 快捷键组合
  keys={['control', 'shift', 'command', 'c']}
  
  // 禁用自动打开编辑器
  disableLaunchEditor={false}
  
  // 编辑器路径（自动检测）
  // editor='cursor' // 或 'vscode', 'code', 'webstorm'
/>
```

### 支持的编辑器

系统会自动检测以下编辑器：
- ✅ Cursor
- ✅ VS Code / VS Code Insiders  
- ✅ WebStorm / IntelliJ IDEA
- ✅ Sublime Text
- ✅ Atom

## 🔧 技术实现

已安装的包：
- **react-dev-inspector** v2.0.1

配置文件：
- `/apps/web/vite.config.ts` - Vite 插件配置（第 6、18 行）
- `/apps/web/src/main.tsx` - Inspector 组件（第 17、101-106 行）

仅在开发模式下启用：
```tsx
{import.meta.env.DEV && <Inspector keys={[...]} />}
```

## 🚨 注意事项

1. **仅开发模式可用**
   - 生产环境自动禁用，不会包含在打包文件中
   - 不影响生产性能

2. **需要编辑器打开项目**
   - 确保 Cursor/VS Code 已经打开了项目目录
   - 首次使用可能需要授权浏览器打开编辑器

3. **快捷键冲突**
   - 如果 `Option/Alt` + 点击 与其他功能冲突
   - 可以通过配置修改快捷键

## 📚 其他开发工具推荐

### React DevTools
浏览器扩展，查看 React 组件树和 Props/State

### Vite DevTools
内置的 HMR 和错误覆盖层

### TanStack Query DevTools
查看查询缓存和状态

## 🎉 效果演示

**之前的工作流程**：
1. 在浏览器看到一个按钮
2. 打开开发者工具
3. 检查元素找到类名
4. 在编辑器中搜索类名或组件名
5. 找到对应文件并打开

**现在的工作流程**：
1. 按 `Ctrl + Shift + Cmd/Alt + C` 激活检查器
2. 点击按钮
3. ✅ 完成！直接在 Cursor 中打开对应文件并定位到代码行

## 🔥 优势对比

| 功能 | 之前 | 现在 |
|------|------|------|
| 查找组件文件 | 手动搜索 🔍 | 一键跳转 ⚡️ |
| 定位代码行 | 需要滚动查找 📜 | 自动定位 🎯 |
| 调试效率 | 5-10 步操作 😓 | 2 步搞定 🚀 |
| React 19 兼容 | ❌ | ✅ |

## 🆚 为什么替换了 click-to-react-component？

之前使用的 `click-to-react-component` 在 React 19 下会报错：
```
Could not find React instance for element
```

**react-dev-inspector** 的优势：
- ✅ 完全兼容 React 19
- ✅ 功能更强大（显示组件信息卡片）
- ✅ 更好的视觉反馈
- ✅ 活跃维护和更新
- ✅ 支持更多编辑器

---

**享受更高效的开发体验！** 🚀

