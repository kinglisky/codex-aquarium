# 动森模型与贴图说明

本目录包含从《集合啦！动物森友会》（Animal Crossing: New Horizons，Nintendo Switch）公开资源转换的模型与贴图，版权属于 Nintendo 等原权利人。它们不适用本仓库源代码的 MIT 许可；素材网站和本项目均不能代原权利人授予使用或再分发许可。本项目与 Nintendo 没有关联。

## 鱼类

来源：固定版本 [ACNH_Resources](https://github.com/969981/ACNH_Resources/tree/9e5d6855fb1216fd8bfd03fba9148a374729112b)。展厅覆盖游戏鱼类图鉴的全部 80 种，使用原始 `Fish*.Nin_NX_NVN.zs`，不重复计算博物馆展台变体和影子。

通过公开 raw 文件接口批量下载，从 Zstandard / SARC / BFRES / BNTX 转换为 GLB。保留原版网格、UV、骨骼与贴图，修正转换器的旋转单位、蒙皮索引与权重，恢复原始颜色及透明度。纹理内嵌，运行时只从本地服务读取。原始文件地址、Git Blob、SHA-256 与转换校验见 [鱼类资源清单](fish-provenance.json)。泳动由程序驱动原版脊椎与鱼鳍骨骼，并非游戏原始动画片段。

## 水下布景

素材包含相同固定版本镜像中的原版博物馆岛礁群落、完整海藻叶丛、苦草、贴底草叶与小圆叶，以及贝类、海胆、海葵等底栖生物。岛礁保留岩石与附着珊瑚的相对位置，叶丛保留原始成簇形态；模型保留原版网格、UV、彩色贴图与透明遮罩。暖色细砂使用未经改色的原版博物馆砂地贴图，铺砂载体、场景摆放与水流动画由本项目制作。

水生植物包含博物馆海水与淡水模型，用于风格化造景，不代表真实海水生态中的共生组合。源文件、提取组件、转换说明与 SHA-256 按类型记录在 [单体与贴底布景资源清单](scenery-provenance.json)、[完整岛礁群落与砂地资源清单](scenery-groups-provenance.json) 和 [完整海藻叶丛资源清单](scenery-leafy-provenance.json)。

## 玩家

身体、发型与服装网格来自公开的 [玩家模型分享目录](https://drive.google.com/drive/folders/1LrMZhtm5gdCf-LQesMfEgTvmxDwlkgyo)，[原分享讨论](https://www.reddit.com/r/AnimalCrossing/comments/zef567/)，以及下述固定版本 ACNH_Resources 镜像。小女孩使用 PlayerBody、PlayerHair07 和 PlayerTopsOnepieceBoxmydesignN。小男孩使用 PlayerHair08、PlayerTopsTopTshirtsH 和 PlayerBottomsPantsHalf，保留原版短发、短袖与短裤网格。保留原版骨骼与 UV，校正坐标、绑定矩阵和站姿，组装为内嵌纹理的 GLB。这是两款组装搭配，并非完整的游戏捏人系统；来源与哈希见 [玩家资源清单](players-provenance.json)。

皮肤、发型、服装底纹、默认眼睛与嘴巴纹理来自 [ACNH_Resources](https://github.com/969981/ACNH_Resources)，固定提交为 `9e5d6855fb1216fd8bfd03fba9148a374729112b`。从原始 Zstandard / SARC / BNTX 资源解码贴图，按游戏通道映射恢复发型灰度、表情透明度与法线。发色与玩家服装配色由本项目调整。小女孩的暖奶油底碎花贴图使用 imagegen 生成，点缀珊瑚色花朵与鼠尾草绿叶；小男孩保留原始条纹形状，改为奶油色与鼠尾草绿配色。模型版型、UV 与骨骼不变；配色、生成提示词与处理记录见玩家资源清单。

## 同行小动物

展厅可选 417 位普通居民及 65 个独立命名特殊角色，普通居民覆盖 35 个物种。居民名单包括 3.0 新增的丘栗、米涅鲁、霓莎和弥莎。姓名来自游戏原始 `STR_NNpcName` / `STR_SNpcName` 文本，物种来自 `STR_Race`。特殊角色按独立名称计数，相同名称的身体或换装变体归为同一选择；原始资源包含 72 个特殊角色身体模型与 74 条身份／形态记录，不能将这些数量当作独立命名角色数。豆狸与粒狸等不同名字共享身体模型的角色保留独立选择。

原始模型、服装与纹理来自上述固定版本 ACNH_Resources 镜像，通过公开 raw 文件接口下载，从 Zstandard / SARC / BFRES / BNTX 转换为内嵌纹理的 GLB。保留原版骨骼，修正转换器的旋转单位、绑定矩阵及附件挂点，并调整自然站姿；普通居民按原始参数表的默认服装 ID 组装原版服装模型与贴图。文件、源地址、转换工具及 SHA-256 见 [旅伴资源清单](companions-provenance.json)。

选择界面支持中文名、英文名或 ID 搜索，以及物种过滤。预览卡片每批展示 36 位，图片按需加载，完整 3D 模型在选中时读取，避免同时加载全部角色。

## 动作与场景

人物选择卡片中的预览图由同一组 GLB 模型在本地渲染，保存在 `portraits/`，素材权利归属与对应模型相同。

下载资源没有包含原始游戏动画。摆尾、转向、跑动、呼吸、重心变化和抬手观赏由本项目程序驱动，不代表游戏原始动画。玩家头部的独立发型骨架同步跟随头骨，衣服与身体共同参与动作。海洋馆建筑、玻璃、水光和界面由本项目制作。

本目录覆盖 80 种鱼类图鉴模型及上述布景与访客模型，并非游戏全部素材的完整镜像。
