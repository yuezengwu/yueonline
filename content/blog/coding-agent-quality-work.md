---
title: "Coding Agent 的质量保证"
date: "2026-07-15"
summary: "构建一套可维护、可观测的 QA 系统，在提高 agent 开发吞吐量的同时保证产品质量"
draft: false
---

coding agent默认的质量工作仍然停留在“运行现有单元测试、CI脚本、阅读代码发现问题”的水平。

我认为需要额外构建一套可维护/可观测的QA系统保证产品质量，让大家能够放心地提高agent的开发吞吐量。

可以分为三个步骤，下面是我的一些实践~

## 1. Make it testable

为当前产品构建完整 QA harness，解决 coding agent 经常跳过的前置工作：

- 理解代码仓库或产品的实际系统架构；
- 尽量使用真实依赖/服务/数据简历测试环境；
- 找到可以驱动和观测的工具，比如操作浏览器并给页面截图，发起API请求并收集日志。

## 2. Test what matters

在具备QA harness后，执行测试，用真实的系统行文和观测结果回答问题：

- 根据需求规划测试路径
- 执行测试并观测系统运行状况
- 区分产品故障/环境故障，观察性能，而不只验证功能
- 输出report或bug artifacts

## 3. Make quality cumulative

完成QA工作后进行积累和维护，持续改善整个工作和系统：

- 确定性的行为脚本进入QA harness
- 新功能和线上问题进入 test case
