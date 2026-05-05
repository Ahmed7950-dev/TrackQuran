import React from 'react';
import { SurahMetadata, Milestone } from './types';

// Tajweed rules are now managed in dataService.ts to allow for dynamic editing.

export const QURAN_METADATA: SurahMetadata[] = [
    { number: 1, name: "ٱلْفَاتِحَة", transliteratedName: "Al-Fatihah", englishName: "The Opening", revelationType: "Meccan", numberOfAyahs: 7, startPage: 1, endPage: 1 },
    { number: 2, name: "ٱلْبَقَرَة", transliteratedName: "Al-Baqarah", englishName: "The Cow", revelationType: "Medinan", numberOfAyahs: 286, startPage: 2, endPage: 49 },
    { number: 3, name: "آلِ عِمْرَان", transliteratedName: "Aal-E-Imran", englishName: "The Family of Imran", revelationType: "Medinan", numberOfAyahs: 200, startPage: 50, endPage: 76 },
    { number: 4, name: "ٱلنِّسَاء", transliteratedName: "An-Nisa", englishName: "The Women", revelationType: "Medinan", numberOfAyahs: 176, startPage: 77, endPage: 106 },
    { number: 5, name: "ٱلْمَائِدَة", transliteratedName: "Al-Ma'idah", englishName: "The Table Spread", revelationType: "Medinan", numberOfAyahs: 120, startPage: 106, endPage: 127 },
    { number: 6, name: "ٱلْأَنْعَام", transliteratedName: "Al-An'am", englishName: "The Cattle", revelationType: "Meccan", numberOfAyahs: 165, startPage: 128, endPage: 150 },
    { number: 7, name: "ٱلْأَعْرَاف", transliteratedName: "Al-A'raf", englishName: "The Heights", revelationType: "Meccan", numberOfAyahs: 206, startPage: 151, endPage: 176 },
    { number: 8, name: "ٱلْأَنْفَال", transliteratedName: "Al-Anfal", englishName: "The Spoils of War", revelationType: "Medinan", numberOfAyahs: 75, startPage: 177, endPage: 186 },
    { number: 9, name: "ٱلتَّوْبَة", transliteratedName: "At-Tawbah", englishName: "The Repentance", revelationType: "Medinan", numberOfAyahs: 129, startPage: 187, endPage: 207 },
    { number: 10, name: "يُونُس", transliteratedName: "Yunus", englishName: "Jonah", revelationType: "Meccan", numberOfAyahs: 109, startPage: 208, endPage: 221 },
    { number: 11, name: "هُود", transliteratedName: "Hud", englishName: "Hud", revelationType: "Meccan", numberOfAyahs: 123, startPage: 221, endPage: 235 },
    { number: 12, name: "يُوسُف", transliteratedName: "Yusuf", englishName: "Joseph", revelationType: "Meccan", numberOfAyahs: 111, startPage: 235, endPage: 248 },
    { number: 13, name: "ٱلرَّعْد", transliteratedName: "Ar-Ra'd", englishName: "The Thunder", revelationType: "Medinan", numberOfAyahs: 43, startPage: 249, endPage: 255 },
    { number: 14, name: "إِبْرَاهِيم", transliteratedName: "Ibrahim", englishName: "Abraham", revelationType: "Meccan", numberOfAyahs: 52, startPage: 255, endPage: 261 },
    { number: 15, name: "ٱلْحِجْر", transliteratedName: "Al-Hijr", englishName: "The Rocky Tract", revelationType: "Meccan", numberOfAyahs: 99, startPage: 262, endPage: 267 },
    { number: 16, name: "ٱلنَّحْل", transliteratedName: "An-Nahl", englishName: "The Bee", revelationType: "Meccan", numberOfAyahs: 128, startPage: 267, endPage: 281 },
    { number: 17, name: "ٱلْإِسْرَاء", transliteratedName: "Al-Isra", englishName: "The Night Journey", revelationType: "Meccan", numberOfAyahs: 111, startPage: 282, endPage: 293 },
    { number: 18, name: "ٱلْكَهْف", transliteratedName: "Al-Kahf", englishName: "The Cave", revelationType: "Meccan", numberOfAyahs: 110, startPage: 293, endPage: 304 },
    { number: 19, name: "مَرْيَم", transliteratedName: "Maryam", englishName: "Mary", revelationType: "Meccan", numberOfAyahs: 98, startPage: 305, endPage: 312 },
    { number: 20, name: "طه", transliteratedName: "Taha", englishName: "Ta-Ha", revelationType: "Meccan", numberOfAyahs: 135, startPage: 312, endPage: 321 },
    { number: 21, name: "ٱلْأَنْبِيَاء", transliteratedName: "Al-Anbiya", englishName: "The Prophets", revelationType: "Meccan", numberOfAyahs: 112, startPage: 322, endPage: 331 },
    { number: 22, name: "ٱلْحَجّ", transliteratedName: "Al-Hajj", englishName: "The Pilgrimage", revelationType: "Medinan", numberOfAyahs: 78, startPage: 332, endPage: 341 },
    { number: 23, name: "ٱلْمُؤْمِنُون", transliteratedName: "Al-Mu'minun", englishName: "The Believers", revelationType: "Meccan", numberOfAyahs: 118, startPage: 342, endPage: 349 },
    { number: 24, name: "ٱلنُّور", transliteratedName: "An-Nur", englishName: "The Light", revelationType: "Medinan", numberOfAyahs: 64, startPage: 350, endPage: 359 },
    { number: 25, name: "ٱلْفُرْقَان", transliteratedName: "Al-Furqan", englishName: "The Criterion", revelationType: "Meccan", numberOfAyahs: 77, startPage: 359, endPage: 366 },
    { number: 26, name: "ٱلشُّعَرَاء", transliteratedName: "Ash-Shu'ara", englishName: "The Poets", revelationType: "Meccan", numberOfAyahs: 227, startPage: 367, endPage: 376 },
    { number: 27, name: "ٱلنَّمْل", transliteratedName: "An-Naml", englishName: "The Ant", revelationType: "Meccan", numberOfAyahs: 93, startPage: 377, endPage: 385 },
    { number: 28, name: "ٱلْقَصَص", transliteratedName: "Al-Qasas", englishName: "The Stories", revelationType: "Meccan", numberOfAyahs: 88, startPage: 385, endPage: 396 },
    { number: 29, name: "ٱلْعَنْكَبُوت", transliteratedName: "Al-Ankabut", englishName: "The Spider", revelationType: "Meccan", numberOfAyahs: 69, startPage: 396, endPage: 404 },
    { number: 30, name: "ٱلرُّوم", transliteratedName: "Ar-Rum", englishName: "The Romans", revelationType: "Meccan", numberOfAyahs: 60, startPage: 404, endPage: 410 },
    { number: 31, name: "لُقْمَان", transliteratedName: "Luqman", englishName: "Luqman", revelationType: "Meccan", numberOfAyahs: 34, startPage: 411, endPage: 414 },
    { number: 32, name: "ٱلسَّجْدَة", transliteratedName: "As-Sajdah", englishName: "The Prostration", revelationType: "Meccan", numberOfAyahs: 30, startPage: 415, endPage: 417 },
    { number: 33, name: "ٱلْأَحْزَاب", transliteratedName: "Al-Ahzab", englishName: "The Combined Forces", revelationType: "Medinan", numberOfAyahs: 73, startPage: 418, endPage: 427 },
    { number: 34, name: "سَبَأ", transliteratedName: "Saba", englishName: "Sheba", revelationType: "Meccan", numberOfAyahs: 54, startPage: 428, endPage: 434 },
    { number: 35, name: "فَاطِر", transliteratedName: "Fatir", englishName: "Originator", revelationType: "Meccan", numberOfAyahs: 45, startPage: 434, endPage: 440 },
    { number: 36, name: "يس", transliteratedName: "Ya-Sin", englishName: "Ya Sin", revelationType: "Meccan", numberOfAyahs: 83, startPage: 440, endPage: 445 },
    { number: 37, name: "ٱلصَّافَّات", transliteratedName: "As-Saffat", englishName: "Those who set the Ranks", revelationType: "Meccan", numberOfAyahs: 182, startPage: 446, endPage: 452 },
    { number: 38, name: "ص", transliteratedName: "Sad", englishName: "The Letter Sad", revelationType: "Meccan", numberOfAyahs: 88, startPage: 453, endPage: 458 },
    { number: 39, name: "ٱلزُّمَر", transliteratedName: "Az-Zumar", englishName: "The Troops", revelationType: "Meccan", numberOfAyahs: 75, startPage: 458, endPage: 467 },
    { number: 40, name: "غَافِر", transliteratedName: "Ghafir", englishName: "The Forgiver", revelationType: "Meccan", numberOfAyahs: 85, startPage: 467, endPage: 476 },
    { number: 41, name: "فُصِّلَت", transliteratedName: "Fussilat", englishName: "Explained in Detail", revelationType: "Meccan", numberOfAyahs: 54, startPage: 477, endPage: 482 },
    { number: 42, name: "ٱلشُّورَىٰ", transliteratedName: "Ash-Shuraa", englishName: "The Consultation", revelationType: "Meccan", numberOfAyahs: 53, startPage: 483, endPage: 489 },
    { number: 43, name: "ٱلزُّخْرُف", transliteratedName: "Az-Zukhruf", englishName: "The Ornaments of Gold", revelationType: "Meccan", numberOfAyahs: 89, startPage: 489, endPage: 495 },
    { number: 44, name: "ٱلدُّخَان", transliteratedName: "Ad-Dukhan", englishName: "The Smoke", revelationType: "Meccan", numberOfAyahs: 59, startPage: 496, endPage: 498 },
    { number: 45, name: "ٱلْجَاثِيَة", transliteratedName: "Al-Jathiyah", englishName: "The Crouching", revelationType: "Meccan", numberOfAyahs: 37, startPage: 499, endPage: 502 },
    { number: 46, name: "ٱلْأَحْقَاف", transliteratedName: "Al-Ahqaf", englishName: "The Wind-Curved Sandhills", revelationType: "Meccan", numberOfAyahs: 35, startPage: 502, endPage: 506 },
    { number: 47, name: "مُحَمَّد", transliteratedName: "Muhammad", englishName: "Muhammad", revelationType: "Medinan", numberOfAyahs: 38, startPage: 507, endPage: 510 },
    { number: 48, name: "ٱلْفَتْح", transliteratedName: "Al-Fath", englishName: "The Victory", revelationType: "Medinan", numberOfAyahs: 29, startPage: 511, endPage: 515 },
    { number: 49, name: "ٱلْحُجُرَات", transliteratedName: "Al-Hujurat", englishName: "The Rooms", revelationType: "Medinan", numberOfAyahs: 18, startPage: 515, endPage: 517 },
    { number: 50, name: "ق", transliteratedName: "Qaf", englishName: "The Letter Qaf", revelationType: "Meccan", numberOfAyahs: 45, startPage: 518, endPage: 520 },
    { number: 51, name: "ٱلذَّارِيَات", transliteratedName: "Adh-Dhariyat", englishName: "The Winnowing Winds", revelationType: "Meccan", numberOfAyahs: 60, startPage: 520, endPage: 523 },
    { number: 52, name: "ٱلطُّور", transliteratedName: "At-Tur", englishName: "The Mount", revelationType: "Meccan", numberOfAyahs: 49, startPage: 523, endPage: 525 },
    { number: 53, name: "ٱلنَّجْم", transliteratedName: "An-Najm", englishName: "The Star", revelationType: "Meccan", numberOfAyahs: 62, startPage: 526, endPage: 528 },
    { number: 54, name: "ٱلْقَمَر", transliteratedName: "Al-Qamar", englishName: "The Moon", revelationType: "Meccan", numberOfAyahs: 55, startPage: 528, endPage: 531 },
    { number: 55, name: "ٱلرَّحْمَٰن", transliteratedName: "Ar-Rahman", englishName: "The Beneficent", revelationType: "Medinan", numberOfAyahs: 78, startPage: 531, endPage: 534 },
    { number: 56, name: "ٱلْوَاقِعَة", transliteratedName: "Al-Waqi'ah", englishName: "The Inevitable", revelationType: "Meccan", numberOfAyahs: 96, startPage: 534, endPage: 537 },
    { number: 57, name: "ٱلْحَدِيد", transliteratedName: "Al-Hadid", englishName: "The Iron", revelationType: "Medinan", numberOfAyahs: 29, startPage: 537, endPage: 541 },
    { number: 58, name: "ٱلْْمُجَادِلَة", transliteratedName: "Al-Mujadila", englishName: "The Pleading Woman", revelationType: "Medinan", numberOfAyahs: 22, startPage: 542, endPage: 545 },
    { number: 59, name: "ٱلْحَشْر", transliteratedName: "Al-Hashr", englishName: "The Exile", revelationType: "Medinan", numberOfAyahs: 24, startPage: 545, endPage: 548 },
    { number: 60, name: "ٱلْمُمْتَحَنَة", transliteratedName: "Al-Mumtahanah", englishName: "She that is to be examined", revelationType: "Medinan", numberOfAyahs: 13, startPage: 549, endPage: 551 },
    { number: 61, name: "ٱلصَّفّ", transliteratedName: "As-Saf", englishName: "The Ranks", revelationType: "Medinan", numberOfAyahs: 14, startPage: 551, endPage: 552 },
    { number: 62, name: "ٱلْجُمُعَة", transliteratedName: "Al-Jumu'ah", englishName: "The Congregation, Friday", revelationType: "Medinan", numberOfAyahs: 11, startPage: 553, endPage: 554 },
    { number: 63, name: "ٱلْمُنَافِقُون", transliteratedName: "Al-Munafiqun", englishName: "The Hypocrites", revelationType: "Medinan", numberOfAyahs: 11, startPage: 554, endPage: 555 },
    { number: 64, name: "ٱلتَّغَابُن", transliteratedName: "At-Taghabun", englishName: "The Mutual Disillusion", revelationType: "Medinan", numberOfAyahs: 18, startPage: 556, endPage: 557 },
    { number: 65, name: "ٱلطَّلَاق", transliteratedName: "At-Talaq", englishName: "The Divorce", revelationType: "Medinan", numberOfAyahs: 12, startPage: 558, endPage: 559 },
    { number: 66, name: "ٱلتَّحْرِيم", transliteratedName: "At-Tahrim", englishName: "The Prohibition", revelationType: "Medinan", numberOfAyahs: 12, startPage: 560, endPage: 561 },
    { number: 67, name: "ٱلْمُلْك", transliteratedName: "Al-Mulk", englishName: "The Sovereignty", revelationType: "Meccan", numberOfAyahs: 30, startPage: 562, endPage: 564 },
    { number: 68, name: "ٱلْقَلَم", transliteratedName: "Al-Qalam", englishName: "The Pen", revelationType: "Meccan", numberOfAyahs: 52, startPage: 564, endPage: 566 },
    { number: 69, name: "ٱلْحَاقَّة", transliteratedName: "Al-Haqqah", englishName: "The Reality", revelationType: "Meccan", numberOfAyahs: 52, startPage: 566, endPage: 568 },
    { number: 70, name: "ٱلْمَعَارِج", transliteratedName: "Al-Ma'arij", englishName: "The Ascending Stairways", revelationType: "Meccan", numberOfAyahs: 44, startPage: 568, endPage: 570 },
    { number: 71, name: "نُوح", transliteratedName: "Nuh", englishName: "Noah", revelationType: "Meccan", numberOfAyahs: 28, startPage: 570, endPage: 571 },
    { number: 72, name: "ٱلْجِنّ", transliteratedName: "Al-Jinn", englishName: "The Jinn", revelationType: "Meccan", numberOfAyahs: 28, startPage: 572, endPage: 573 },
    { number: 73, name: "ٱلْمُزَّمِّل", transliteratedName: "Al-Muzzammil", englishName: "The Enshrouded One", revelationType: "Meccan", numberOfAyahs: 20, startPage: 574, endPage: 575 },
    { number: 74, name: "ٱلْمُدَّثِّر", transliteratedName: "Al-Muddaththir", englishName: "The Cloaked One", revelationType: "Meccan", numberOfAyahs: 56, startPage: 575, endPage: 577 },
    { number: 75, name: "ٱلْقِيَامَة", transliteratedName: "Al-Qiyamah", englishName: "The Resurrection", revelationType: "Meccan", numberOfAyahs: 40, startPage: 577, endPage: 578 },
    { number: 76, name: "ٱلْإِنْسَان", transliteratedName: "Al-Insan", englishName: "Man", revelationType: "Medinan", numberOfAyahs: 31, startPage: 578, endPage: 580 },
    { number: 77, name: "ٱلْمُرْسَلَات", transliteratedName: "Al-Mursalat", englishName: "The Emissaries", revelationType: "Meccan", numberOfAyahs: 50, startPage: 580, endPage: 581 },
    { number: 78, name: "ٱلنَّبَإ", transliteratedName: "An-Naba", englishName: "The Tidings", revelationType: "Meccan", numberOfAyahs: 40, startPage: 582, endPage: 583 },
    { number: 79, name: "ٱلنَّازِعَات", transliteratedName: "An-Nazi'at", englishName: "Those who drag forth", revelationType: "Meccan", numberOfAyahs: 46, startPage: 583, endPage: 584 },
    { number: 80, name: "عَبَسَ", transliteratedName: "Abasa", englishName: "He Frowned", revelationType: "Meccan", numberOfAyahs: 42, startPage: 585, endPage: 585 },
    { number: 81, name: "ٱلتَّكْوِير", transliteratedName: "At-Takwir", englishName: "The Overthrowing", revelationType: "Meccan", numberOfAyahs: 29, startPage: 586, endPage: 586 },
    { number: 82, name: "ٱلْإِنْفِطَار", transliteratedName: "Al-Infitar", englishName: "The Cleaving", revelationType: "Meccan", numberOfAyahs: 19, startPage: 587, endPage: 587 },
    { number: 83, name: "ٱلْمُطَفِّفِين", transliteratedName: "Al-Mutaffifin", englishName: "The Defrauding", revelationType: "Meccan", numberOfAyahs: 36, startPage: 587, endPage: 589 },
    { number: 84, name: "ٱلْإِنْشِقَاق", transliteratedName: "Al-Inshiqaq", englishName: "The Sundering", revelationType: "Meccan", numberOfAyahs: 25, startPage: 589, endPage: 589 },
    { number: 85, name: "ٱلْبُرُوج", transliteratedName: "Al-Buruj", englishName: "The Mansions of the Stars", revelationType: "Meccan", numberOfAyahs: 22, startPage: 590, endPage: 590 },
    { number: 86, name: "ٱلطَّارِق", transliteratedName: "At-Tariq", englishName: "The Nightcommer", revelationType: "Meccan", numberOfAyahs: 17, startPage: 591, endPage: 591 },
    { number: 87, name: "ٱلْأَعْلَىٰ", transliteratedName: "Al-A'la", englishName: "The Most High", revelationType: "Meccan", numberOfAyahs: 19, startPage: 591, endPage: 592 },
    { number: 88, name: "ٱلْغَاشِيَة", transliteratedName: "Al-Ghashiyah", englishName: "The Overwhelming", revelationType: "Meccan", numberOfAyahs: 26, startPage: 592, endPage: 592 },
    { number: 89, name: "ٱلْفَجْر", transliteratedName: "Al-Fajr", englishName: "The Dawn", revelationType: "Meccan", numberOfAyahs: 30, startPage: 593, endPage: 594 },
    { number: 90, name: "ٱلْبَلَد", transliteratedName: "Al-Balad", englishName: "The City", revelationType: "Meccan", numberOfAyahs: 20, startPage: 594, endPage: 594 },
    { number: 91, name: "ٱلشَّمْس", transliteratedName: "Ash-Shams", englishName: "The Sun", revelationType: "Meccan", numberOfAyahs: 15, startPage: 595, endPage: 595 },
    { number: 92, name: "ٱللَّيْل", transliteratedName: "Al-Layl", englishName: "The Night", revelationType: "Meccan", numberOfAyahs: 21, startPage: 595, endPage: 596 },
    { number: 93, name: "ٱلضُّحَىٰ", transliteratedName: "Ad-Duhaa", englishName: "The Morning Hours", revelationType: "Meccan", numberOfAyahs: 11, startPage: 596, endPage: 596 },
    { number: 94, name: "ٱلشَّرْح", transliteratedName: "Ash-Sharh", englishName: "The Relief", revelationType: "Meccan", numberOfAyahs: 8, startPage: 596, endPage: 596 },
    { number: 95, name: "ٱلتِّين", transliteratedName: "At-Tin", englishName: "The Fig", revelationType: "Meccan", numberOfAyahs: 8, startPage: 597, endPage: 597 },
    { number: 96, name: "ٱلْعَلَق", transliteratedName: "Al-Alaq", englishName: "The Clot", revelationType: "Meccan", numberOfAyahs: 19, startPage: 597, endPage: 597 },
    { number: 97, name: "ٱلْقَدْر", transliteratedName: "Al-Qadr", englishName: "The Power", revelationType: "Meccan", numberOfAyahs: 5, startPage: 598, endPage: 598 },
    { number: 98, name: "ٱلْبَيِّنَة", transliteratedName: "Al-Bayyinah", englishName: "The Clear Proof", revelationType: "Medinan", numberOfAyahs: 8, startPage: 598, endPage: 599 },
    { number: 99, name: "ٱلزَّلْزَلَة", transliteratedName: "Az-Zalzalah", englishName: "The Earthquake", revelationType: "Medinan", numberOfAyahs: 8, startPage: 599, endPage: 599 },
    { number: 100, name: "ٱلْعَادِيَات", transliteratedName: "Al-Adiyat", englishName: "The Courser", revelationType: "Meccan", numberOfAyahs: 11, startPage: 599, endPage: 600 },
    { number: 101, name: "ٱلْقَارِعَة", transliteratedName: "Al-Qari'ah", englishName: "The Calamity", revelationType: "Meccan", numberOfAyahs: 11, startPage: 600, endPage: 600 },
    { number: 102, name: "ٱلتَّكَاثُر", transliteratedName: "At-Takathur", englishName: "The Piling Up", revelationType: "Meccan", numberOfAyahs: 8, startPage: 600, endPage: 600 },
    { number: 103, name: "ٱلْعَصْر", transliteratedName: "Al-Asr", englishName: "The Declining Day", revelationType: "Meccan", numberOfAyahs: 3, startPage: 601, endPage: 601 },
    { number: 104, name: "ٱلْهُمَزَة", transliteratedName: "Al-Humazah", englishName: "The Traducer", revelationType: "Meccan", numberOfAyahs: 9, startPage: 601, endPage: 601 },
    { number: 105, name: "ٱلْفِيل", transliteratedName: "Al-Fil", englishName: "The Elephant", revelationType: "Meccan", numberOfAyahs: 5, startPage: 601, endPage: 601 },
    { number: 106, name: "قُرَيْش", transliteratedName: "Quraysh", englishName: "Quraysh", revelationType: "Meccan", numberOfAyahs: 4, startPage: 602, endPage: 602 },
    { number: 107, name: "ٱلْمَاعُون", transliteratedName: "Al-Ma'un", englishName: "The Small Kindnesses", revelationType: "Meccan", numberOfAyahs: 7, startPage: 602, endPage: 602 },
    { number: 108, name: "ٱلْكَوْثَر", transliteratedName: "Al-Kawthar", englishName: "The Abundance", revelationType: "Meccan", numberOfAyahs: 3, startPage: 602, endPage: 602 },
    { number: 109, name: "ٱلْكَافِرُون", transliteratedName: "Al-Kafirun", englishName: "The Disbelievers", revelationType: "Meccan", numberOfAyahs: 6, startPage: 603, endPage: 603 },
    { number: 110, name: "ٱلنَّصْر", transliteratedName: "An-Nasr", englishName: "The Divine Support", revelationType: "Medinan", numberOfAyahs: 3, startPage: 603, endPage: 603 },
    { number: 111, name: "ٱلْمَسَد", transliteratedName: "Al-Masad", englishName: "The Palm Fiber", revelationType: "Meccan", numberOfAyahs: 5, startPage: 603, endPage: 603 },
    { number: 112, name: "ٱلْإِخْلَاص", transliteratedName: "Al-Ikhlas", englishName: "The Sincerity", revelationType: "Meccan", numberOfAyahs: 4, startPage: 604, endPage: 604 },
    { number: 113, name: "ٱلْفَلَق", transliteratedName: "Al-Falaq", englishName: "The Daybreak", revelationType: "Meccan", numberOfAyahs: 5, startPage: 604, endPage: 604 },
    { number: 114, name: "ٱلنَّاس", transliteratedName: "An-Nas", englishName: "Mankind", revelationType: "Meccan", numberOfAyahs: 6, startPage: 604, endPage: 604 },
];

export const TOTAL_QURAN_PAGES = 604;
export const POINTS_PER_WORD = 12.8539661;
export const MISTAKE_PENALTY_POINTS = 12.8539661; // Penalty is equivalent to one word


const JUZ_END_PAGES: Record<number, number> = {
    1: 21, 2: 41, 3: 61, 4: 81, 5: 101, 6: 121, 7: 141, 8: 161, 9: 181, 10: 201, 
    11: 221, 12: 241, 13: 261, 14: 281, 15: 301, 16: 321, 17: 341, 18: 361, 19: 381, 20: 401,
    21: 421, 22: 441, 23: 461, 24: 481, 25: 501, 26: 521, 27: 541, 28: 561, 29: 581, 30: 604
};

const arePagesCovered = (pagesSet: Set<number>, startPage: number, endPage: number): boolean => {
    for (let i = startPage; i <= endPage; i++) {
        if (!pagesSet.has(i)) {
            return false;
        }
    }
    return true;
};

export const MILESTONES: Milestone[] = [
    {
        id: 'al-baqarah',
        title: 'Al-Baqarah',
        description: 'Completed Surah Al-Baqarah',
        badgeIcon: React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", className: "h-6 w-6", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2 }, React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" })),
        isAchieved: (completedPages) => {
            const surahMeta = QURAN_METADATA[1]; // Al-Baqarah
            return arePagesCovered(completedPages, surahMeta.startPage, surahMeta.endPage);
        }
    },
    {
        id: '5-juz',
        title: '5 Ajza',
        description: 'Completed 100 pages of the Quran',
        badgeIcon: '5',
        isAchieved: (completedPages) => completedPages.size >= 100
    },
     {
        id: '10-juz',
        title: '10 Ajza',
        description: 'Completed 200 pages of the Quran',
        badgeIcon: '10',
        isAchieved: (completedPages) => completedPages.size >= 200
    },
     {
        id: '15-juz',
        title: 'Nisf Al-Quran',
        description: 'Completed Half of the Quran (300 pages)',
        badgeIcon: '15',
        isAchieved: (completedPages) => completedPages.size >= 300
    },
     {
        id: 'ya-seen',
        title: 'Qalb Al-Quran',
        description: 'Completed Surah Ya-Seen, the Heart of the Quran',
        badgeIcon: React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", className: "h-6 w-6", viewBox: "0 0 20 20", fill: "currentColor" }, React.createElement('path', { fillRule: "evenodd", d: "M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z", clipRule: "evenodd" })),
        isAchieved: (completedPages) => {
             const surahMeta = QURAN_METADATA[35]; // Ya-Sin
             return arePagesCovered(completedPages, surahMeta.startPage, surahMeta.endPage);
        }
    },
    {
        id: 'khatm',
        title: 'Khatm Al-Quran',
        description: 'Completed the entire Quran',
        badgeIcon: React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", className: "h-6 w-6", viewBox: "0 0 20 20", fill: "currentColor" }, React.createElement('path', { d: "M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" })),
        isAchieved: (completedPages) => arePagesCovered(completedPages, 1, TOTAL_QURAN_PAGES)
    },
];