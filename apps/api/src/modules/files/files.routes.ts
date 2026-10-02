import { Router } from 'express';
import type { AppDependencies } from '../../http/dependencies';
import { authOf, requireAuth } from '../../http/middleware/require-auth';
import { parseId } from '../groups/groups.service';
import { readFileFor } from './files.service';

/** Shown in the page: images and audio. Anything else is always downloaded, never rendered. */
const INLINE = /^(image\/(webp|png|jpeg|gif)|audio\/)/;

export function createFilesRouter({ db, storage }: AppDependencies): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/:fileId', async (req, res) => {
    const { row, data } = await readFileFor(
      { db, storage },
      authOf(req).user,
      parseId(req.params.fileId, 'File'),
    );
    const disposition = INLINE.test(row.contentType) ? 'inline' : 'attachment';
    const name = row.originalName ?? `file.${row.storageKey.split('.').pop() ?? 'bin'}`;

    res
      .status(200)
      .set({
        'Content-Type': row.contentType,
        'Content-Length': String(data.length),
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
        // A file never changes under its id; it is private to signed-in people.
        'Cache-Control': 'private, max-age=31536000, immutable',
        // Even if a file were opened directly, it could run nothing.
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
      })
      .end(data);
  });

  return router;
}
