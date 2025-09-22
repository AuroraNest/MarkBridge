declare module 'turndown' {
  export interface Options {
    headingStyle?: 'setext' | 'atx';
    codeBlockStyle?: 'indented' | 'fenced';
    emDelimiter?: string;
    bulletListMarker?: string;
  }

  export default class TurndownService {
    constructor(options?: Options);
    addRule(name: string, rule: unknown): this;
    keep(filter: string | string[]): this;
    turndown(input: string): string;
  }
}
