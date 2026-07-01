declare module 'markdown-it' {
  class MarkdownIt {
    constructor(presetName?: string, options?: Record<string, unknown>);
    render(content: string): string;
    use(plugin: unknown, ...params: unknown[]): this;
  }

  export default MarkdownIt;
}
