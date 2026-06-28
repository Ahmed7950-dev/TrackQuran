// avatarManifest.ts
// -----------------------------------------------------------------------------
// Bundled animated student avatars (Lottie JSON). Files live under
//   public/avatars/boys/*.json   and   public/avatars/girls/*.json
// and are served at stable URLs (/avatars/boys/<file>) so a student's saved
// profileIcon keeps working across deploys.
//
// As avatar JSON files are added to public/avatars/<group>/, list their file
// names here (with the .json extension).
// -----------------------------------------------------------------------------

export type AvatarGender = 'male' | 'female';

const FOLDER: Record<AvatarGender, string> = { male: 'boys', female: 'girls' };

export const AVATAR_FILES: Record<AvatarGender, string[]> = {
  male: [],
  female: [],
};

export const avatarSrc = (gender: AvatarGender, file: string): string => `/avatars/${FOLDER[gender]}/${file}`;

export const listAvatars = (gender: AvatarGender) =>
  AVATAR_FILES[gender].map(file => ({ file, name: file.replace(/\.json$/i, ''), src: avatarSrc(gender, file) }));

/** Infer the gender group from a saved avatar src so the picker opens on the right tab. */
export const genderFromSrc = (src?: string): AvatarGender => (src && src.includes('/girls/') ? 'female' : 'male');
