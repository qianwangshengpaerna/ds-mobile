# ds mobile 0.2.0 检查记录

日期：2026-11-17（北京时间）。

## 本次问题与改动

用户录屏中出现键盘遮住输入框、左上角菜单进入状态栏的现象。旧实现直接对 WebView 添加 padding，而网页 frame 使用 fixed / 100dvh；未由原生父容器统一处理系统与 IME 的可用区域。

新增 `SafeAreaLayout` 作为原生父容器：Android 11+ 显式处理 systemBars、displayCutout 与 ime；底部避让取导航栏与键盘的最大值，不重复累加。键盘动画期间按 onProgress 更新尺寸，结束后重新请求最终 insets。向子 WebView 转发已处理类型的零值，避免二次裁切与收键盘后的残留边距。旧系统继续使用 adjustResize。网页 Native 模式使用父 viewport，保留浏览器模式的 visualViewport 逻辑。

实现参考：[Android 官方 WebView window insets 文档](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets)。

## 已通过

- TypeScript 类型检查、oxlint、生产 Rspack 构建。
- 原官方 v3 ZIP 测试：分支、图片、导出再导入，以及三个损坏/不兼容压缩包的失败回滚。
- 项目分组/专属指令、Gemini 模拟流式响应、MCP 初始化/工具列表/调用。
- 移动 DOM：欢迎页、项目、API 配置和插件确认。
- 新增 viewport 回归：旧 WebView 的 visualViewport 停留在旧尺寸时，不覆盖 Android 原生布局；模拟展开、收起、候选栏高度和旋转变化；保持输入框焦点；普通浏览器仍使用 visualViewport。
- 原生 JS 桥：密钥保存路由、UTF-8 分块、multipart 上传和取消。
- 生产 Chromium 131 页面渲染：412px 宽的首页和会话页各 8 次 viewport 高度变化（860→710→590→470→420→470→650→860），输入框及发送按钮始终在页面可见范围内，焦点保留，顶栏位置稳定。另检查 780×330 横屏和 412×470 设置弹层。
- Android APK 编译与 v2 / v3 签名验证；包名 app.dsmobile，versionCode 2，versionName 0.1.1。
- 新旧 APK 签名证书 SHA-256 相同，可覆盖旧版本。数据库版本、存储源地址和 Keystore 别名未更改。

## 验证边界

页面测试模拟 Android 缩小 WebView 的可用区域，不能复现某个手机系统真实分发 WindowInsets 或真实 IME 动画的全过程。此次没有 Android 真机/模拟器；安装后的录音、不同 ROM 输入法、手势导航和真实键盘动画仍需设备验证。未发送真实付费 API 请求。

## 0.2.0 增量验证

- 模型协议测试：DeepSeek 鉴权头、Gemini 分页、非聊天模型过滤、无效 Key 报错；生产页面两个模型控件均为 SELECT，读取列表后可选择并保存。
- 文档工具：生产页面模拟模型生成可编辑正文，分别生成 DOCX/XLSX/PDF，以正确 MIME、中文文件名交给原生文件导出桥。生成文件用 python-docx、openpyxl、pypdf 独立打开验证；PDF 中文提取、自动分页通过，另渲染检查了 PDF 首页。
- 缓存：8000 总输入、6000 命中显示 75.0%，Gemini promptTokenCount 不重复计数；没有接口数据时不估算；缓存指标加入后 360×470 的输入框未被挤出可见区。
- Android 16 / API 36 Robolectric 框架层模拟：状态栏与 IME 尺寸变化、逐帧动画、取消恢复、横屏开孔 4 项通过；文件选择器 MIME/中文名/取消、目录持久写权限请求、ContentResolver 写入实际临时文件 3 项通过。WebView 的测量与 FrameLayout 几何分别校验，不能替代真实 Chromium WebView 的设备绘制。
- 保留此前生产 Chromium 的 16 帧键盘高度变化测试，首页/会话页/横屏/设置弹层通过。

验证不包含真实 API Key 联调、真实 Android 设备或真实 SAF 文档提供器的持久目录授权。应用内文件夹选择及 ROM 输入法动画仍需手机验收。
