module.exports = {
  root: true,
  extends: ['@mathboard/config/eslint'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: './tsconfig.json'
  },
  settings: {
    react: {
      version: '18.3'
    }
  }
};
