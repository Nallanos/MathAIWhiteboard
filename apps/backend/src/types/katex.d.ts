declare module 'katex' {
  const katex: {
    renderToString: (
      tex: string,
      options?: {
        displayMode?: boolean;
        throwOnError?: boolean;
        strict?: 'ignore' | 'warn' | 'error' | boolean;
      }
    ) => string;
  };

  export default katex;
}
