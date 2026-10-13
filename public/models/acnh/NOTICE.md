# 动森模型与贴图说明

本目录包含从《集合啦！动物森友会》（Animal Crossing: New Horizons，Nintendo Switch）公开资源转换的模型与贴图，版权属于 Nintendo 等原权利人。它们不适用本仓库源代码的 MIT 许可；素材网站和本项目均不能代原权利人授予使用或再分发许可。本项目与 Nintendo 没有关联。

## 鱼类

来源：[Models Resource 的动森分类](https://models.spriters-resource.com/nintendo_switch/animalcrossingnewhorizons/)。当前展厅使用 10 种：大白鲨、鲸鲨、翻车鱼、皇带鱼、真鲷、凤尾鱼、管眼鱼、锦鲤、金鱼和竹荚鱼。

使用网站公开的 ZIP 附件接口批量下载，保留原版网格、UV、骨骼和贴图，将 DAE 转换为 GLB。转换时移除游戏专用的顶点材质遮罩，重建 PBR 材质、透明度与管眼鱼头罩。纹理嵌入 GLB，运行时只从本地服务读取。源页面、下载地址及 SHA-256 记录在 [provenance.json](provenance.json)。

## 玩家

身体、发型与服装网格来自公开的 [玩家模型分享目录](https://drive.google.com/drive/folders/1LrMZhtm5gdCf-LQesMfEgTvmxDwlkgyo)，[原分享讨论](https://www.reddit.com/r/AnimalCrossing/comments/zef567/)。使用 PlayerBody、PlayerHair07 和 PlayerTopsOnepieceBoxmydesignN，保留原版骨骼与 UV，校正坐标、绑定矩阵和站姿，组装为单个 GLB。

皮肤、发型、服装底纹、默认眼睛与嘴巴纹理来自 [ACNH_Resources](https://github.com/969981/ACNH_Resources)，固定提交为 `9e5d6855fb1216fd8bfd03fba9148a374729112b`。从原始 Zstandard / SARC / BNTX 资源解码贴图，按游戏通道映射恢复发型灰度、表情透明度与法线。发色及蓝色服装配色为本项目染色。

## 动作与场景

下载资源没有包含原始游戏动画。摆尾、转向、步行与观赏动作由本项目程序驱动，不代表游戏原始动画。海洋馆建筑、玻璃、水光和界面由本项目制作。

本目录不是游戏完整素材库，也不包含全部游戏鱼类。原站现有 28 项鱼资源已在本地下载并转换，当前发行包仅包含展厅使用的 10 种。
