declare module 'mammoth/mammoth.browser' {
  interface ConvertToHtmlResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  interface HtmlOptions {
    styleMap?: string[];
  }

  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: HtmlOptions
  ): Promise<ConvertToHtmlResult>;
}
