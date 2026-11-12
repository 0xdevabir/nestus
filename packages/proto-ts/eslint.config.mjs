import base from '@nestus/config/eslint.config.mjs';

export default [
  ...base,
  {
    ignores: ['src/gen/**'],
  },
];
