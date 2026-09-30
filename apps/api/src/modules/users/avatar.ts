import { fileUrl } from '../files/files.service';

/** The picture to show for someone: the photo they uploaded here, otherwise their Google one. */
export function avatarUrlOf(user: { avatarFileId: string | null; avatarUrl: string | null }) {
  return user.avatarFileId ? fileUrl(user.avatarFileId) : user.avatarUrl;
}
