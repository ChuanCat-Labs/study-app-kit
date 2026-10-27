# 制作配置

开始时集中提醒一次，对明确提供或已确认的选择继续使用，不反复询问。更换图标只复制PNG原图；如果另行要求绘制或编辑图片，遵循执行环境中的图片工作流。

## app-config.json

| 字段 | 含义 | 使用方法 |
| --- | --- | --- |
| label | 手机显示的软件名称 | 默认“复习助手”，首次提醒确认 |
| icon | PNG相对路径 | 默认`assets/app-icon.png`，无编号黑猫；可改为自己的文件 |
| applicationId | Android安装身份 | 创建器自动生成；同一软件更新保持不变 |
| versionName | 显示版本 | 首次独立项目为1.0.0 |
| versionCode | 更新序号 | 正整数；内容改变后打包更新时递增 |

图标原图直接进入Android资源，构建后校验字节一致。自选图片可能含拍摄或文本元数据，公开分发前单独检查；原文件只保存在自己的项目里。

## production.json

`personalization`三个确认标记用来提醒维护者检查软件名、图标和课程名。不要因为AI自动拟定了值就标为已确认；使用者明确选择或确认后更新。`iconChoice`记录默认黑猫或自选。

`sourcePolicy`默认以个人笔记为主要资料，教材用于核对与补充。建议同时提供两类资料，但不把缺教材设成制作门槛。使用者可以指定其他主要资料。课堂重点、考试范围和资料优先级按明确要求记录。

`exam.scope`初始为`unspecified`。未明确范围时不把知识点标为必考、不自行凑题。题型使用`choice`、`judgment`、`fill`、`essay`；数量为制作目标，不能为了达到数量编造或重复题。了解栏目是否出简单回顾题由使用者决定。

`processing`区分制作过程与学习运行：软件运行离线；制作默认不把材料交给外部服务。使用外部AI/OCR之前说明处理范围与去向，由使用者选择。本套件不保存服务密钥，不自动调用服务。

## 本地核查文件

- `.local/source-manifest.json`：来源角色、文件相对位置、校验值、提取及复核状态、页码映射。
- `.local/content-review.json`：知识点与来源条目的对应、必保留内容、重点、处理结果、关联题目与具体疑问。
- `.local/project-origin.json`：套件版本、创建时间和是否使用中性示例。

来源页码分别记PDF页序、印刷页码或图片序号。按实际文件逐页确认，不套用其他资料的页码偏移。

核查条目至少包含`id`、`lessonId`、`sourceIds`、`sourceLocation`、`retainedItems`、`questionIds`、`status`与`question`。`status`可用`pending`、`retained`、`corrected`、`removed-by-request`、`merged-by-request`。涉及订正时补充原句、最终写法、用户确认与核对依据。没有依据时保留待确认，不能以空清单冒充核对完成。
