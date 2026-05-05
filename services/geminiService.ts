import { Student } from "../types";

/**
 * All Gemini calls are routed through /api/gemini (a Vercel serverless function).
 * This keeps the GEMINI_API_KEY server-side — it is never in the browser bundle.
 */
const callGeminiProxy = async (prompt: string): Promise<string> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Proxy error ${response.status}`);
  }

  const data = await response.json();
  return data.text ?? '';
};

export const generateTeacherComment = async (
  student: Student,
  studentData: any,
  manualComment?: string,
): Promise<string> => {
  const basePrompt = `
You are a compassionate and encouraging Quran teacher. Based on the following progress data for a student named ${student.name}, please write a brief, positive, and constructive comment for their guardian.

Data for the selected period:
- Last Achievement (Reading): ${studentData.lastAchievementText}
- Total Pages Read: ${studentData.totalPages}
- Total Pages Memorized: ${studentData.totalMemorizedPages}
- Average Reading Quality (out of 10): ${studentData.avgReadingQuality.toFixed(1)}
- Average Memorization Quality (out of 10): ${studentData.avgMemorizationQuality.toFixed(1)}
- Attendance: ${studentData.attendance.present} days present, ${studentData.attendance.absent} days absent, ${studentData.attendance.rescheduled} days rescheduled.
- Tajweed Rules Mastered: ${student.masteredTajweedRules.join(', ') || 'None yet'}
`;

  const instruction = manualComment
    ? `The teacher has written a draft comment: "${manualComment}". Please refine and enhance this comment. Keep the original sentiment but improve the wording to be more eloquent, positive, and constructive for the student's guardian. Integrate some of the provided data points naturally if it strengthens the comment.`
    : `Based on the data, please write a brief, positive, and constructive comment for the student's guardian.
Instructions:
1. Start with a warm greeting addressing the parent/guardian.
2. Highlight the student's strengths and recent accomplishments in both reading and memorization.
3. Mention their consistency or effort based on attendance.
4. If there are areas for improvement (e.g., lower quality scores, absences), frame it constructively and gently.
5. Keep the tone positive and motivating.
6. Conclude with an encouraging closing statement.

Do not just list the stats. Weave them into a natural, paragraph-form comment.`;

  try {
    return (await callGeminiProxy(`${basePrompt}\n\n${instruction}`)).trim();
  } catch (error) {
    console.error("Gemini proxy error:", error);
    return "There was an error generating the AI comment. Please try again.";
  }
};
