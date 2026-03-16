declare module 'exif-parser' {
  interface ExifData {
    tags?: {
      DateTimeOriginal?: number;
      CreateDate?: number;
      [key: string]: any;
    };
    imageSize?: {
      width: number;
      height: number;
    };
    [key: string]: any;
  }

  interface Parser {
    parse(): ExifData;
  }

  function create(buffer: Buffer): Parser;

  export { create, Parser, ExifData };
}
