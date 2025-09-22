declare module 'html-docx-js/dist/html-docx' {
  interface ExportOptions {
    orientation?: 'portrait' | 'landscape';
    margins?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
  }

  interface HtmlDocxStatic {
    asBlob(html: string, options?: ExportOptions): Blob;
  }

  const htmlDocx: HtmlDocxStatic;
  export default htmlDocx;
}
