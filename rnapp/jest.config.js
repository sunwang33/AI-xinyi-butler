// Jest 配置：采用 Expo 官方单测预设（jest-expo，SDK 58 / Jest 30）。
// transformIgnorePatterns、transform、setupFiles 等均由预设按官方约定提供，
// 仅转译 node_modules 中的 react-native / expo 等 ESM 包，无需在此重复声明。
// 纯逻辑测试（如日子引擎 engine.test.ts）可在文件顶部加
// `/** @jest-environment node */` 指定 Node 环境运行。
/** @type {import('jest').Config} */
const config = {
  preset: 'jest-expo',
};

module.exports = config;
