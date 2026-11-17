# ds mobile

基于 DeepSeek 官方 `deepseek-ai/chat-demo` 的 Android 客户端。白色与蓝色为主，保留官方聊天、历史 ZIP 导入、文件、语音、Markdown、公式和图表能力，增加项目空间、Gemini 文字聊天和 MCP 插件管理。它是第三方改编应用，不是 DeepSeek 官方客户端。

## 下载

Android 8.0+，建议使用较新的 Android System WebView。安装包和 SHA-256 校验文件见 [GitHub Releases](https://github.com/qianwangshengpaerna/ds-mobile/releases/latest)。

## 0.2.1 侧栏动画

- 在手机上打开或关闭侧栏时，面板滑动，遮罩同步渐变。快速切换方向时，动画从当前位置继续。
- 保留会话列表滚动位置，开关侧栏时聊天区宽度保持稳定。
- 支持返回键关闭侧栏、关闭后归还菜单按钮焦点，以及系统的减少动态效果设置。

## 0.2.0 新增功能

- 模型由输入框改为下拉选择：填写 Key 后点击「读取 DeepSeek 模型」或「读取 Gemini 模型」，从官方接口获取当前账号返回的兼容文字模型列表；Gemini 支持分页。保留上次列表与选择用于离线显示。列表可见不代表余额或调用额度充足；未使用真实 Key 验证各账号权限。
- 内置 Word、Excel、PDF 文档工具：首页「制作文档」或侧栏「文档」，也可从插件中心打开。可提取当前回答、手动编辑，或按制作需求调用当前所选模型生成文字。检查内容后点击「制作并保存到本地」。这些是内置插件，不需要连接额外服务器。
- 设置 → 通用 → 导出位置（API 连接页也可设置）：通过 Android 系统文件夹选择器授予默认目录访问权限。文档和历史 ZIP 备份沿用该位置，支持恢复每次询问；目录不可写时回退到另存为。保留中文文件名及正确 MIME，不覆盖同名文件。
- 输入框新增输入缓存指标：最近一次完成请求的总输入 tokens、缓存命中 tokens、命中率。DeepSeek 读取最终 message_delta.usage；Gemini 读取 usageMetadata。无用量的历史记录明确显示暂无数据，指标不估算服务器未来是否命中，不等同于当前上下文占用。联网工具的输入用量可能累计多步请求。
- 延续 0.1.1 的键盘与状态栏修正；包名和签名不变，版本码为 3，可直接覆盖安装。

## 0.1.1 布局修正

- 修复输入法弹出后聊天输入框仍留在屏幕底部、被键盘遮挡的问题。
- 修复左上角菜单与状态栏重叠的问题，顶栏和侧栏位于系统安全区域内。
- Android 原生父容器统一处理状态栏、屏幕开孔和键盘边距，并在 IME 动画进度回调中更新 WebView 的真实尺寸；已处理的边距传给 WebView 时清零。
- Android 宿主模式不再用网页的 `100dvh` / `visualViewport` 二次计算高度，避免不同 WebView 版本回报尺寸不一致。
- 包名、数据目录与签名均沿用 0.1.0，版本码提升为 2。可直接覆盖安装保留本地聊天和 API 设置；不要先卸载旧版。

## 安装与使用

1. 从 GitHub Releases 下载 APK，在 Android 8.0 或更新系统安装。需要较新的 Android System WebView（建议 Chromium 120+）。安装包不区分 CPU 架构。
2. 点首页顶部 DeepSeek，分别填写 DeepSeek / Gemini API Key，选择供应商后保存。发送消息会验证服务是否可用。点击读取模型后从下拉列表选择；账号须有对应权限。
3. 首页「导入 DeepSeek ZIP」可以直接选择 DeepSeek 原应用导出的历史记录压缩包，无需解压。也可从项目空间进入导入设置。
4. 「项目空间」中新建项目、设置专属指令；新对话自动归入当前项目。已有对话可移动，侧边栏按当前项目筛选。删除项目只移除分组，保留聊天。
5. 「插件中心」添加 HTTPS MCP Streamable HTTP 地址和可选 Bearer Token。连接后选择工具、填写 JSON 参数，确认执行。可把结果放进聊天草稿，再发送给所选模型。

API 调用需使用自己的密钥；模型、工具、文件、语音费用及区域可用性由供应商决定。

## DeepSeek 原应用历史 ZIP

直接沿用上游的流式导入器，支持当前 `export_format_version: 3`：首条 `manifest.json`、`chat_sessions/*.json`、`chat_session_index.json` 和压缩包中的图片。保留对话树、当前分支、正文、思考内容和可映射的工具记录；非图片附件通常只有官方导出的元数据，无法恢复压缩包中本来不存在的文件。支持 ZIP32 STORE / DEFLATE，不支持 ZIP64、加密和分卷 ZIP。

导入前会提示覆盖。完成结构、索引、分支和 ZIP 完整性检查后才在同一个 IndexedDB 事务中替换现有聊天；校验失败保留原有记录。导入后切换到全部对话，避免项目筛选隐藏新导入的会话。旧版或未来版本若改变格式，会明确报错，不猜测转换。

「备份项目和全部聊天」生成 ds mobile 自有备份，包含官方格式的历史 ZIP、项目和指令；不包含 API Key、插件 Token 或插件连接配置。恢复自有备份会替换聊天及项目。项目备份文件限制 100 MB；官方聊天 ZIP 导入不额外设置这一业务大小限制，但受手机内存和存储影响。

## 功能范围

| 功能 | 实现 |
|---|---|
| DeepSeek | 官方 Anthropic-compatible Messages / Files、深度思考、智能搜索、链接阅读、附件解析、ASR / TTS、服务端安全检查 |
| Gemini | 原生 `streamGenerateContent` 文字流式聊天，从账号列表选择模型；默认 `gemini-2.5-flash` |
| 项目 | 新建、编辑、删除、对话归类、筛选、专属指令、项目备份 |
| 插件 | MCP Streamable HTTP、初始化、会话 ID、工具列表分页、JSON 参数执行、结果加入草稿 |
| 历史 | 官方 v3 ZIP 导入 / 导出、对话分支、导入失败回滚 |
| Android | 本地打包前端、原生 HTTPS 请求桥、系统文件选择与保存、麦克风权限、Android Keystore 加密配置 |

Gemini 首版支持文字；文件和语音功能请切换 DeepSeek。DeepSeek 的思考和联网开关不会传给 Gemini。插件首版为手动执行，不包含模型自主调用、OAuth、stdio、旧式 SSE MCP 或 ChatGPT 商店插件安装。项目提供分组与共享指令，不自动把同项目的全部其他聊天发送给模型。

## 隐私与权限

Android 使用 Keystore AES-GCM 加密保存 DeepSeek Key、Gemini Key、插件 Token 和项目配置，聊天与附件在本机 IndexedDB。聊天请求直连所选供应商；外接 MCP 插件只接收执行时填写的参数。内置文件排版在本机进行，模型生成文字会把制作需求发送给所选供应商。将插件结果加入草稿并发送后，所选模型服务会收到这些资料。

只请求网络和录音权限；麦克风在使用语音时申请。导入 / 导出通过系统文件选择器，不申请全盘存储权限。禁止明文 HTTP 和跨域跳转转发密钥，外链在系统浏览器打开；插件网络目标必须先在应用中添加授权。系统自动备份关闭。卸载会删除本机数据，先导出备份。

## 源码与构建

- `upstream/`：已改编的官方前端源码，新增功能在 `src/mobile/`。
- `android/`：无第三方原生依赖的 Java WebView 宿主，可用 Android Studio 打开。
- `build_apk.py`：Linux 命令行构建，下载有 SHA256 校验的官方 SDK 工具；有 JDK 时用 javac，只有 JRE 时使用校验后的 Eclipse 编译器。
- `tests/`：官方格式样例生成器、导入/回滚/协议集成测试、移动端 DOM 交互测试和原生 JavaScript 桥测试。

构建前端及 APK（Python 3、Node 22.12+、Java 17+、curl、unzip）：

```bash
cd upstream
npm ci
npm run type
npm run lint
npm run build
cd ..
python3 build_apk.py
```

也可 `python3 build_apk.py --web` 一次构建。脚本输出位于项目文件夹的上一级。使用已有 SDK 时设置 `DS_ANDROID_TOOLS`（包含 aapt2、d8 等）及 `DS_ANDROID_JAR`（android.jar 的完整路径）。Android Studio 构建前先把 `upstream/dist/` 内容复制到 `android/app/src/main/assets/web/`，命令行脚本会自动完成复制。

安装包采用本地开发证书签名，通过 APK v2 / v3 签名校验。源码包不包含私钥；重新构建会生成自己的证书，不能直接覆盖不同证书签名的旧版本，先备份数据。正式分发应自行配置并长期保存发行签名。
使用 `python3 build_apk.py --unsigned` 可生成已对齐的待签名 APK。覆盖升级时，签名证书须与已安装版本一致。

运行不消耗真实 API 额度的测试：

```bash
node tests/run-tests.cjs
```

测试使用模拟 API 和 fake-indexeddb；已验证当前源码的导入导出、分支和图片恢复、三个错误 ZIP 的回滚、项目指令、Gemini 流、MCP 会话/工具、移动 DOM 交互和桥接编码。未使用真实 API Key 联调，也未进行 Android 真机或模拟器安装测试；语音、各机型系统文件选择、键盘布局和供应商实时可用性仍需设备验证。测试 ZIP 是根据官方 schema 构造的样例，不是用户真实账号导出。

可选的生产页面布局测试（需要 Playwright 和 Chromium；没有 Android 模拟器依赖）：

```bash
cd upstream
npm install --no-save playwright
npx playwright install chromium-headless-shell
node ../tests/mobile-layout.cjs
```

可用 `CHROME_HEADLESS_PATH` 指定已有的 Chromium / headless shell。该测试模拟 WebView 可用高度变化，检查首页与会话页共 16 个键盘展开/收起帧的输入框、发送按钮、焦点及顶栏位置，并检查横屏与设置弹层边界；它不等同于 Android 设备上的真实输入法动画测试。最新检查结果见 `TEST_REPORT.md`。

## 上游与许可

基于上游提交 `5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c`，保留 MIT 许可证及第三方许可通知。

- 官方源码：https://github.com/deepseek-ai/chat-demo
- 官方应用 API 指南：https://api-docs.deepseek.com/guides/build_a_chatbot/
- 官方历史格式说明：`upstream/src/services/chat/history/README.md`
- Gemini API：https://ai.google.dev/gemini-api/docs/text-generation

本版本新增代码按 MIT 许可分发；原上游版权见 `LICENSE` 和 `upstream/LICENSE`。第三方依赖许可收录在 `THIRD_PARTY_NOTICES.txt`，也随应用资源分发。

## 文档工具与缓存说明

Word 支持标题、段落、简单列表；Excel 支持 TSV、CSV 和 Markdown 表格，首行冻结，数字保留数值，单元格不执行输入的公式；PDF 内置 Noto Sans CJK SC 字体，支持中文、换行和分页，字体仅在制作 PDF 时加载。复杂图片、Word 原生表格/公式/页面设计不在此版本范围内。每份正文最多 200000 字符，表格最多 10000 行、200 列、100000 个单元格。

「导出路径」通过系统授权目录实现，不使用虚假的任意绝对路径。Android 11+ 系统会限制某些根目录；请在系统允许的文件夹中选择位置。默认目录的真实文件系统/云文档提供器权限与各 ROM 文件选择器仍需设备验证。

缓存命中率 = 缓存命中 tokens / 总输入 tokens。DeepSeek 总输入按未命中 + 命中 + 缓存创建统计；Gemini promptTokenCount 已含 cachedContentTokenCount，不重复相加。标准官方 ZIP 不保存这些接口用量，导入后需要新的请求才能显示。

接口依据：[DeepSeek models](https://api-docs.deepseek.com/api/list-models)、[Gemini models](https://ai.google.dev/api/models)、[DeepSeek usage](https://api-docs.deepseek.com/guides/anthropic_api/)、[Android SAF](https://developer.android.com/training/data-storage/shared/documents-files)。
