import { Student, AgeCategory } from '../types';
import { getRecitedPagesSet, getMemorizedPagesSet } from './dataService';

const getAge = (dob: string): number => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

const getAgeGroup = (age: number): 'young' | 'aspiring' | 'devoted' | null => {
    if (age >= 4 && age <= 15) return 'young';
    if (age >= 16 && age <= 35) return 'aspiring';
    if (age >= 36) return 'devoted';
    return null;
}

// The effective age category — the same rule the dashboard groups by: a manual
// ageCategory always wins, otherwise derive from dob (fallback young_gems). The
// ranking MUST use this so a student's rank group matches the group the tutor sees.
const effectiveCategory = (s: Student): AgeCategory => {
    if (s.ageCategory) return s.ageCategory;
    const age = s.dob ? getAge(s.dob) : NaN;
    if (isNaN(age)) return 'young_gems';
    if (age <= 15) return 'young_gems';
    if (age <= 35) return 'aspiring_scholars';
    return 'devoted_learners';
};

export const getStudentRankAndProgress = (
    currentStudent: Student,
    allStudents: Student[],
    type: 'reading' | 'memorization'
): { rank: number; totalInGroup: number; pagesToNext: number | null, nextStudentName: string | null } => {
    const currentStudentGroup = effectiveCategory(currentStudent);
    const studentsInGroup = allStudents.filter(s => effectiveCategory(s) === currentStudentGroup);
    
    // "Reading" counts memorized pages as read too (a hifz student has also
    // read those pages), matching the page counts shown everywhere else.
    const getScore = (student: Student): number => {
        return type === 'reading'
            ? new Set<number>([...getRecitedPagesSet(student), ...getMemorizedPagesSet(student)]).size
            : getMemorizedPagesSet(student).size;
    };

    const rankedStudents = studentsInGroup
        .map(s => ({ id: s.id, name: s.name, score: getScore(s) }))
        .sort((a, b) => b.score - a.score);

    const studentIndex = rankedStudents.findIndex(s => s.id === currentStudent.id);
    if (studentIndex === -1) {
        return { rank: 0, totalInGroup: studentsInGroup.length, pagesToNext: null, nextStudentName: null };
    }

    const rank = studentIndex + 1;
    let pagesToNext: number | null = null;
    let nextStudentName: string | null = null;
    
    // If not ranked #1, calculate pages to next student
    if (studentIndex > 0) {
        const currentStudentScore = rankedStudents[studentIndex].score;
        const nextRankedStudent = rankedStudents[studentIndex - 1];
        
        // Only show if there's an actual difference
        if (nextRankedStudent.score > currentStudentScore) {
             pagesToNext = nextRankedStudent.score - currentStudentScore;
             nextStudentName = nextRankedStudent.name.split(' ')[0]; // Get first name
        }
    }

    return { rank, totalInGroup: studentsInGroup.length, pagesToNext, nextStudentName };
};

/**
 * Rank among ALL of the tutor's students (every age group), by reading or
 * memorization pages. Returns rank (1-indexed) and the total student count.
 */
export const getOverallRankAndProgress = (
    currentStudent: Student,
    allStudents: Student[],
    type: 'reading' | 'memorization'
): { rank: number; total: number } => {
    const getScore = (student: Student): number =>
        type === 'reading'
            ? new Set<number>([...getRecitedPagesSet(student), ...getMemorizedPagesSet(student)]).size
            : getMemorizedPagesSet(student).size;

    const ranked = allStudents
        .map(s => ({ id: s.id, score: getScore(s) }))
        .sort((a, b) => b.score - a.score);

    const idx = ranked.findIndex(s => s.id === currentStudent.id);
    return { rank: idx === -1 ? 0 : idx + 1, total: allStudents.length };
};

/** Ranks precomputed into a shared report so the public portal can show real
 *  ranks (the portal only has the one student's data, not the roster). */
export interface ReportRanks {
    readingRank: number; readingTotal: number;
    hifdhRank: number; hifdhTotal: number;
    overallReadingRank: number; overallReadingTotal: number;
}

export const computeReportRanks = (student: Student, allStudents: Student[]): ReportRanks => {
    const reading = getStudentRankAndProgress(student, allStudents, 'reading');
    const hifdh = getStudentRankAndProgress(student, allStudents, 'memorization');
    const overall = getOverallRankAndProgress(student, allStudents, 'reading');
    return {
        readingRank: reading.rank, readingTotal: reading.totalInGroup,
        hifdhRank: hifdh.rank, hifdhTotal: hifdh.totalInGroup,
        overallReadingRank: overall.rank, overallReadingTotal: overall.total,
    };
};