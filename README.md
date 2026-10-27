# Study App Kit

把自己的笔记、知识资料和辅助教材制作成可离线使用的复习软件。套件包含通用界面、Android源码、课程数据格式、制作Skill和本地工具。默认课程为空；中性示例只演示接入方法，不包含真实学科内容。

**建议同时提供自己整理的资料与原教材或相关章节。**个人整理和明确要求决定复习范围、顺序与重点；教材用于核对和必要补充。只有一类资料也能开始，识别不清或内容冲突会列为待确认项。

## 最快开始

准备Node.js 20或更新版本，在套件目录运行：

```sh
node tools/create-project.mjs --course-id my-course --name "我的复习"
node tools/check-project.mjs --project local/projects/my-course
```

新项目放在`local/projects/my-course/`，自动生成独立应用标识；默认使用无编号黑猫原图。开始时确认软件名、课程名和图标，可保留默认值，也可换自己的PNG。创建不会覆盖已有目录。

把这个项目和资料交给AI，并使用[可直接复制的制作任务说明](docs/start-with-ai.md)或[复习软件制作Skill](skills/review-app-workflow/SKILL.md)。不依赖作者的聊天记录、私人账号或特定AI服务。

可先在本地登记原文件：

```sh
node tools/intake.mjs --project local/projects/my-course --notes "笔记.pdf" --textbook "教材.pdf"
```

登记工具只原样保存文件、计算校验值和区分来源。文本提取、扫描识别、知识整理和题目制作由AI协作流程完成，需核对原页。详见[制作流程](docs/workflow.md)。

## 先看一个完整的中性示例

```sh
node tools/create-project.mjs --course-id try-course --name "示例复习" --example
node tools/serve.mjs --project local/projects/try-course --port 8000
```

打开`http://127.0.0.1:8000/`。示例包含编号重点、公式、连续步骤、来源图、荧光和四种题型。其源资料见`examples/neutral/`，内容是甲、乙等虚构占位条目，不用于学习真实知识。停止服务使用Ctrl+C。

已有项目整理好`course-data.json`后运行：

```sh
node tools/prepare-course.mjs --project local/projects/my-course
node tools/check-project.mjs --project local/projects/my-course
node tools/serve.mjs --project local/projects/my-course --port 8000
```

## 软件能力

- 知识点、背诵、统计三页导航；目录、模块、搜索、重点、收藏及疑问筛选。
- 编号条目、重点字重和颜色、MathML公式、连续推导、分步例题、代码图和原图放大。
- 资料回查、局部图片显示和可开关荧光层，保留原图片。
- 选择、判断和填空按已配置答案判分，题目可显示待识别图片；大题查看答案后自评。看答案和读完知识点不制造答题成绩。
- 按课程隔离记录；收藏、意见、草稿、中断恢复、JSON备份与历史兼容。
- Android离线外壳、系统返回、系统文件选择和备份保存。

App中的“导入”用于恢复学习记录。课程资料通过制作流程整理后打包。学习时离线运行；制作中如需把材料发送给外部AI或OCR，先说明去向、所需内容和用户的选择。

## Android打包

准备Python 3.10+、JDK 17+、Android SDK platform 34与build-tools 34.0.0；设置`JAVA_HOME`与`ANDROID_HOME`，或按工具帮助显式指定路径。

```sh
node tools/doctor.mjs
python tools/build-apk.py --project local/projects/my-course
```

安装包位于该项目的`output/`。构建只装入运行文件和课程实际引用的图片，逐项核对资源与图标，生成校验报告；不自动安装或发布。

首次本地构建生成该项目专用签名，保存在`.signing/`。应私下备份完整项目和签名；更新保持应用身份、签名和课程ID，递增版本。详见[更新与备份](docs/update-and-backup.md)。源码构建不需要其他人的APK或签名。

## 验证与维护

```sh
npm test
node tools/audit-public.mjs --report output/public-audit.json
```

浏览器交互验证另见[检查与交付](docs/check-and-deliver.md)。内容核对、显示检查与功能验证分别记录；工具通过只说明其覆盖的范围，不能自动证明知识和考试范围正确。

真实课程在独立项目中维护，模板保持空课程。`production.json`记录个性化、资料优先级和制作选择；`app-config.json`记录应用名称、图标和安装身份。字段见[配置说明](docs/configuration.md)与[课程接入说明](docs/course-contract.md)。

本地资料和签名默认排除出发布清单。仓库分发前还要进行人工隐私检查并确定代码与默认图标的使用许可，见[隐私与复用](docs/privacy-and-reuse.md)和`DISTRIBUTION.json`。当前以私有模板仓库维护，公开分发许可待确定。可通过GitHub的“Use this template”创建独立项目，或下载源码后按上述步骤制作。
