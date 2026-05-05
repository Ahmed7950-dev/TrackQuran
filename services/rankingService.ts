import { Student } from '../types';
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

export const getStudentRankAndProgress = (
    currentStudent: Student,
    allStudents: Student[],
    type: 'reading' | 'memorization'
): { rank: number; totalInGroup: number; pagesToNext: number | null, nextStudentName: string | null } => {
    const currentStudentAge = getAge(currentStudent.dob);
    const currentStudentGroup = getAgeGroup(currentStudentAge);

    if (!currentStudentGroup) {
        return { rank: 0, totalInGroup: 0, pagesToNext: null, nextStudentName: null };
    }

    const studentsInGroup = allStudents.filter(s => getAgeGroup(getAge(s.dob)) === currentStudentGroup);
    
    const getScore = (student: Student): number => {
        return type === 'reading' 
            ? getRecitedPagesSet(student).size
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