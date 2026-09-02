# 上岸学习看板

这是一个适合 GitHub Pages 部署的静态学习数据看板第一版，支持：

- 学习记录表格展示
- 两人学习数据对比
- 个人模块总览和分栏统计
- 热力图、柱状图、折线图、雷达图
- 轻量表单提交示例

## 目录结构

- `index.html`：页面入口
- `styles.css`：总体样式
- `app.js`：数据渲染与图表逻辑
- `data/`：示例数据文件

## 运行方式

在本地可直接启动一个静态服务器：

```bash
cd /Users/kyle/Desktop/上岸/record
python3 -m http.server 8000
```

然后打开：

```text
http://localhost:8000
```

## GitHub Pages 部署

将仓库推送到 GitHub 后，在仓库设置中启用 GitHub Pages，默认使用根目录部署即可。

## 说明

当前版本使用本地 JSON 示例数据，适合：

- 两人学习记录
- 数据量较小
- 需要快速做出看板原型

后续可升级为 Supabase 或其他数据库方案。
