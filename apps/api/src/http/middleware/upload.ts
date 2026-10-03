import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import { HttpError } from '../http-error';

/**
 * Reads one file from a multipart form into memory, with hard limits on its size and on the rest of
 * the form. The bytes are checked afterwards by what they contain, not by the name or type sent.
 */
export function acceptOneFile(field: string, maxBytes: number): RequestHandler {
  return acceptFiles(field, maxBytes, 1);
}

/** Up to `maxCount` files under one field name, each within `maxBytes`. */
export function acceptFiles(field: string, maxBytes: number, maxCount: number): RequestHandler {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxBytes,
      files: maxCount,
      fields: 5,
      fieldSize: 20_000,
      parts: maxCount + 6,
    },
  });
  const parse = maxCount === 1 ? parser.single(field) : parser.array(field, maxCount);

  return (req, res, next) => {
    parse(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      if (
        error instanceof multer.MulterError &&
        (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE')
      ) {
        next(new HttpError(400, 'TOO_MANY_FILES', 'Too many files', { details: { maxCount } }));
        return;
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(
          new HttpError(413, 'FILE_TOO_LARGE', 'The file is too large', {
            details: { maxBytes },
          }),
        );
        return;
      }
      next(new HttpError(400, 'VALIDATION_FAILED', 'The upload could not be read'));
    });
  };
}

/** The uploaded file, if the form had one. */
export function uploadedFile(
  req: Request,
): { buffer: Buffer; originalName: string; declaredType: string } | null {
  const file = req.file;
  if (!file || file.size === 0) {
    return null;
  }
  // Browsers send the name in UTF-8 while multer reads it as Latin-1.
  const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
  return { buffer: file.buffer, originalName, declaredType: file.mimetype };
}

/** The uploaded files of a multi-file form, in the order they were sent. */
export function uploadedFiles(
  req: Request,
): { buffer: Buffer; originalName: string; declaredType: string }[] {
  const list = Array.isArray(req.files) ? req.files : [];
  return list
    .filter((file) => file.size > 0)
    .map((file) => ({
      buffer: file.buffer,
      originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      declaredType: file.mimetype,
    }));
}
