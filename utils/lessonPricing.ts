// utils/lessonPricing.ts
// One price for every student (Nov 2026): $10 for a 25-minute lesson, $20 for
// a 50-minute lesson, 4 lessons a month or more. The landing page's price
// picker and the /pricing page both read these numbers.
export const LESSON_PRICES = { 25: 10, 50: 20 } as const;
export type LessonLength = keyof typeof LESSON_PRICES;
export const MIN_LESSONS_PER_MONTH = 4;
