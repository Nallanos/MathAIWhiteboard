module.exports = {
  root: true,
  extends: ['@mathboard/config/eslint'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: './tsconfig.json'
  },
  env: {
    node: true
  }
};
