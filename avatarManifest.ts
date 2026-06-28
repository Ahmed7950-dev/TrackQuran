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
  male: [
    'annoying.json', 'arab-man.json', 'baby-boy.json', 'boy.json', 'boy-1.json', 'boy-2.json', 'boy-2-2.json',
    'businessman.json', 'child.json', 'children.json', 'crying.json', 'cyborg.json', 'eating.json',
    'financial-advisor.json', 'gamer.json', 'golf-player.json', 'laughing.json', 'man.json', 'man-copy.json',
    'muslim.json', 'muted.json', 'nursing-technician.json', 'personal-trainer.json', 'pet-love.json',
    'programmer.json', 'reading-1.json', 'sleepy.json', 'student.json', 'student-1.json', 'student-2.json',
    'student-3.json', 'student-4.json', 'superhero.json', 'superhero-copy.json', 'teacher.json',
    'world-creativity-and-innovation-day.json',
  ],
  female: [],
};

export const avatarSrc = (gender: AvatarGender, file: string): string => `/avatars/${FOLDER[gender]}/${file}`;

export const listAvatars = (gender: AvatarGender) =>
  AVATAR_FILES[gender].map(file => ({ file, name: file.replace(/\.json$/i, ''), src: avatarSrc(gender, file) }));

/** Infer the gender group from a saved avatar src so the picker opens on the right tab. */
export const genderFromSrc = (src?: string): AvatarGender => (src && src.includes('/girls/') ? 'female' : 'male');
