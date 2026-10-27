# 课程接入说明

默认`course-data.json`为空。以下是字段说明，不包含学科内容；完整中性界面样例在`tests/fixtures/ui-course.json`，仅供开发验证。

## 必需结构

课程包含字符串`id`及`modules`、`lessons`、`questions`三个数组。ID使用字母、数字、下划线、短横线或点，以字母或数字开始。每类ID不得重复。

课程可配置`version`、`title`、`description`、`notice`、`sourceInfo`。这些字段只用于标题和说明；未提供来源信息时不会强制显示某本书或作者。

模块使用`id`、`title`。知识点使用`id`、`module`、`title`；题目使用`id`、`module`、`lessonId`、`type`、`text`和`answer`。题目与知识点的模块必须相同。知识点的`questionIds`由验证器从题目关系生成，避免手写关系漂移。

## 知识点显示

- 简单内容：`concept`、`explain`、`warning`、`formula`为文字；`metrics`为标签和值组成的二项数组列表。
- 重点与范围：`exam`使用重点／了解／不考等提示，`examNote`为范围说明，`focusFields`指定concept／metrics／formula等重点字段，`displayNumber`为固定显示编号。
- 编号条目：`numberedSections`数组，每组包含`title`、`items`及可选`focus`。条目可为文字，或包含`title`、`text`、`emphasis`、`focus`、`priority`、`formula`的对象。
- 措施：`prevention`为包含`title`和`items`的组列表，连续编号；`preventionTitle`可改栏目名称。
- 数学公式：`formulas`中每项有`label`、`math`和`meaning`；`math`填写受限MathML内容，不能放脚本、事件、HTML或外部资源。普通文字支持`x_i`、`x_{中文下标}`和Unicode上下标；不是任意LaTeX渲染器。
- 连续过程：`process`数组，每项有`title`、`text`和可选`image`、`formula`。`layout: "process"`可将过程作为主学习内容。
- 图片：`figures`数组，每项有`title`、`image`、`caption`，点击打开原图。`image`对象可显示单张插图，字段为`src`、`caption`。
- 局部原页显示：`sourceFigure`包含`title`、`image`、`caption`、`nativeWidth`及`crop`，crop为x/y/width/height。仅改变显示区域，点击仍打开完整文件。
- 分步例题：`workedExample`包含`title`、`question`、`steps`、`result`；steps每项有`title`及`formula`。
- 补充校注：`calibrationNote`为默认折叠的说明，不自动成为题目。

所有图片路径应相对课程包根目录，不能逃逸到上级、指定绝对路径或使用脚本URL。图片文件必须随课程部署；Android打包仅支持PNG、JPEG和SVG。

## 原页和荧光

`refs`为来源数组。图片来源包含`id`、`label`、`image`；`preview: false`可关闭该引用的内嵌预览。外部链接使用`kind: "external"`及HTTP或HTTPS的`url`。`primarySource`选择优先预览的来源ID。

荧光坐标保存在课程的`highlights`对象。来源可指定`highlightKey`；默认使用`知识点ID:来源ID`。每项有原图`width`、`height`及`rects`矩形数组，矩形字段为`x`、`y`、`width`、`height`，单位为原图坐标。原图保留不改，界面叠加可开关的标记层。缩放与窗口变化时应检查实际边界是否一致。

同一原页可供多个知识点引用，各自使用不同的荧光键；没有对应标记时只显示原页。

## 题目

- 选择题：`type: "choice"`、`options`字符串数组、从0开始的`correct`索引。
- 判断题：同选择题，另加`format: "judgment"`，选项提供两个判断值。
- 填空题：`type: "choice"`、`format: "fill"`、`accepted`字符串答案数组，或单一`expectedAnswer`。匹配忽略大小写、空白和常见标点，不支持开放式语义评分。
- 大题：`type: "essay"`，可加`desc`。显示`answer`后由用户自评。

题目范围必须由课程作者确定，框架不从补充说明自动出题。

题目可配置`sourceFigure`显示待识别图片，字段与知识点的局部图片相同：`image`、`nativeWidth`和`crop`。需要整图时裁剪范围覆盖整图。题目中的图片使用中性提示与替代文本，不读取来源标题、答案或图注作为提示；制作时检查图中本身也没有不应提前出现的答案。图片路径及裁剪宽度在准备阶段校验，资源随课程打包。

## 历史兼容

`legacy.questions`仅保存退出题目的id/type/module/lessonId，不在新题池显示；`legacy.lessonIds`保存删除或合并的旧知识点ID；`legacy.lessonAliases`将旧ID映射到当前ID；`legacy.storageKeys`仅用于明确的同课程旧存储键迁移。

合并映射的目标必须是活动知识点，不能形成链或环。旧ID不能同时作为活动知识点。不要让其他课程或原演示记录参与真实课程统计。

## 准备与构建

运行`node tools/prepare-course.mjs`验证JSON并生成`course-data.js`。也可传入输入和输出路径用于独立预览。验证只证明结构和关联有效，事实、图意、重点和考试范围仍须由课程制作过程核对。

Android构建读取相同的课程JSON生成桥接配置，再打包生成后的网页。应用名称和安装ID由`app-config.json`配置；学习记录仍以课程ID隔离。
