import { PHOTO_MAX_BYTES, meResponseSchema } from '@acu/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  WEB_ORIGIN,
  createTestContext,
  setDoctorCode,
  type Agent,
  type TestContext,
} from '../../test/harness';
import { errorOf, signInAsDoctor, signInAsStudent } from '../../test/people';
import { sniffType } from './sniff';

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext();
  await setDoctorCode(context);
});

afterAll(async () => {
  await context.close();
});

async function png(width = 800, height = 600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#f95a00' } })
    .png()
    .toBuffer();
}

/** A photo carrying a GPS position in its metadata, like one taken with a phone. */
async function jpegWithLocation(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 400, channels: 3, background: '#174593' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'Phone', Model: 'Camera' }, IFD3: { GPSLatitudeRef: 'N' } })
    .toBuffer();
}

function uploadAvatar(agent: Agent, data: Buffer, name = 'photo.png') {
  return agent.put('/api/me/avatar').set('Origin', WEB_ORIGIN).attach('file', data, name);
}

describe('recognising uploads by their content', () => {
  it.each([
    ['JPEG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'x', 'image/jpeg'],
    ['PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'x', 'image/png'],
    ['GIF', Buffer.from('GIF89a......'), 'x', 'image/gif'],
    ['WebP', Buffer.from('RIFF\0\0\0\0WEBPVP8 '), 'x', 'image/webp'],
    ['PDF', Buffer.from('%PDF-1.7\n'), 'x', 'application/pdf'],
    ['WebM audio', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2]), 'x', 'audio/webm'],
    ['Ogg audio', Buffer.from('OggS\0\u0002'), 'x', 'audio/ogg'],
    ['WAV audio', Buffer.from('RIFF\0\0\0\0WAVEfmt '), 'x', 'audio/wav'],
    ['MP3 audio', Buffer.from('ID3\u0004\0'), 'x', 'audio/mpeg'],
    ['M4A audio', Buffer.from('\0\0\0 ftypM4A \0\0'), 'x', 'audio/mp4'],
    [
      'Word document',
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]),
      'Lesson 3.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  ])('knows %s', (_label, data, name, contentType) => {
    expect(sniffType(data, name)?.contentType).toBe(contentType);
  });

  it.each([
    ['a web page renamed to .jpg', Buffer.from('<html><script>alert(1)</script>'), 'cat.jpg'],
    [
      'an SVG image, which can carry scripts',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'),
      'a.svg',
    ],
    ['a Windows program', Buffer.from('MZ\u0090\0\u0003'), 'setup.exe'],
    ['a ZIP that is not an Office file', Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'archive.zip'],
    ['an empty file', Buffer.alloc(0), 'empty.png'],
  ])('refuses %s', (_label, data, name) => {
    expect(sniffType(data, name)).toBeNull();
  });
});

describe('profile photos', () => {
  it('replaces the Google picture with a square, cleaned photo', async () => {
    const student = await signInAsStudent(context);

    const response = await uploadAvatar(student.agent, await jpegWithLocation(), 'me.jpg').expect(
      200,
    );
    const user = meResponseSchema.parse(response.body).user;
    expect(user.customAvatar).toBe(true);
    expect(user.avatarUrl).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/);

    const file = await student.agent.get(user.avatarUrl ?? '').expect(200);
    expect(file.headers['content-type']).toBe('image/webp');
    const metadata = await sharp(file.body as Buffer).metadata();
    expect([metadata.width, metadata.height]).toEqual([256, 256]);
    expect(metadata.exif).toBeUndefined();
  });

  it('deletes the previous photo when a new one arrives, and can go back to Google', async () => {
    const student = await signInAsStudent(context);
    await uploadAvatar(student.agent, await png()).expect(200);
    await uploadAvatar(student.agent, await png(300, 300)).expect(200);
    expect(context.storage.files.size).toBeGreaterThan(0);
    const before = context.storage.files.size;

    const response = await student.agent
      .delete('/api/me/avatar')
      .set('Origin', WEB_ORIGIN)
      .expect(200);

    expect(meResponseSchema.parse(response.body).user).toMatchObject({
      customAvatar: false,
      avatarUrl: null,
    });
    expect(context.storage.files.size).toBe(before - 1);
  });

  it('refuses anything that is not an image, whatever its name', async () => {
    const student = await signInAsStudent(context);

    const script = await uploadAvatar(student.agent, Buffer.from('<script>x</script>'), 'a.png');
    expect(script.status).toBe(415);
    expect(errorOf(script).code).toBe('UNSUPPORTED_FILE');
    const pdf = await uploadAvatar(student.agent, Buffer.from('%PDF-1.7\n'), 'cv.pdf');
    expect(errorOf(pdf).code).toBe('UNSUPPORTED_FILE');
  });

  it('refuses a photo that is too large, and a request without one', async () => {
    const student = await signInAsStudent(context);

    const large = await uploadAvatar(student.agent, Buffer.alloc(PHOTO_MAX_BYTES + 1, 1));
    expect(large.status).toBe(413);
    expect(errorOf(large).code).toBe('FILE_TOO_LARGE');
    const empty = await student.agent.put('/api/me/avatar').set('Origin', WEB_ORIGIN).expect(400);
    expect(errorOf(empty).code).toBe('VALIDATION_FAILED');
  });

  it('shows the photo to other signed-in people, never to visitors', async () => {
    const student = await signInAsStudent(context);
    const doctor = await signInAsDoctor(context);
    const response = await uploadAvatar(student.agent, await png()).expect(200);
    const url = meResponseSchema.parse(response.body).user.avatarUrl ?? '';

    await doctor.agent.get(url).expect(200);
    await context.client().get(url).expect(401);
    await doctor.agent.get('/api/files/00000000-0000-4000-8000-000000000000').expect(404);
    await doctor.agent.get('/api/files/not-a-file').expect(404);
  });

  it('serves files so that a browser can run nothing in them', async () => {
    const student = await signInAsStudent(context);
    const response = await uploadAvatar(student.agent, await png()).expect(200);
    const file = await student.agent
      .get(meResponseSchema.parse(response.body).user.avatarUrl ?? '')
      .expect(200);

    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['content-security-policy']).toContain('sandbox');
    expect(file.headers['content-disposition']).toMatch(/^inline/);
    expect(file.headers['cache-control']).toContain('private');
  });
});
