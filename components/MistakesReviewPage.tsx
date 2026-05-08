import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Student, QuranVerse, Mistake } from '../types';
import { QURAN_METADATA } from '../constants';
import { useI18n } from '../context/I18nProvider';
import { createOrUpdateSharedReport, getStudentReportId, getReportPlays, getSharedReport, updateHomeworkVerses, saveStudent, resetVersePlayCount } from '../services/dataService';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthProvider';


// Helper function to check if a character is an Arabic letter
const isArabicLetter = (char: string | undefined): boolean => {
    if (!char) return false;
    const code = char.charCodeAt(0);
    // Basic Arabic letters (U+0621–U+064A)
    if (code >= 0x0621 && code <= 0x064A) return true;
    // Extended Arabic letters used in Quranic orthography
    // (e.g. ٱ Alef Wasla U+0671). Excludes U+0670 which is a combining mark.
    if (code >= 0x0671 && code <= 0x06D3) return true;
    if (code === 0x06D5) return true;
    if (code >= 0x06EE && code <= 0x06EF) return true;
    if (code >= 0x06FA && code <= 0x06FC) return true;
    return false;
};

// Parse word into individual letters with their indices
const parseWordIntoLetters = (word: string): Array<{ letter: string; index: number }> => {
    const letters: Array<{ letter: string; index: number }> = [];
    if (!word || typeof word !== 'string') return letters;
    let letterIndex = 0;
    for (let i = 0; i < word.length; i++) {
        const char = word[i];
        if (isArabicLetter(char)) {
            letters.push({ letter: char, index: letterIndex });
            letterIndex++;
        } else {
            // Attach diacritics to the previous letter, or create a standalone unit
            if (letters.length > 0) {
                letters[letters.length - 1].letter += char;
            } else {
                letters.push({ letter: char, index: letterIndex });
            }
        }
    }
    return letters;
};

/** Returns the timestamp of the most recent mistake logged for a given verse. */
const getVerseNewestTime = (verseKey: string, mistakes: Record<string, any>): number => {
    const [s, a] = verseKey.split(':');
    const prefix = `${s}:${a}:`;
    let max = 0;
    for (const [key, m] of Object.entries(mistakes)) {
        if (key.startsWith(prefix) && m?.date) {
            const t = new Date(m.date).getTime();
            if (!isNaN(t) && t > max) max = t;
        }
    }
    return max;
};

const getMistakeColor = (level: number): string => {
    switch (level) {
        case 1: return 'bg-yellow-200/70 dark:bg-yellow-500/30';
        case 2: return 'bg-orange-300/70 dark:bg-orange-500/30';
        case 3: return 'bg-red-400/70 dark:bg-red-500/30';
        case 4: return 'bg-orange-300/70 dark:bg-orange-500/30'; // correction
        case 5: return 'bg-yellow-200/70 dark:bg-yellow-500/30'; // correction
        default: return 'transparent';
    }
};

const toEasternArabicNumerals = (num: number): string => {
    const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return String(num).split('').map(digit => arabicNumerals[parseInt(digit, 10)]).join('');
};

interface MistakesReviewPageProps {
  student: Student;
  showTitle?: boolean;
  onBack?: () => void;
  teacherId?: string;
  onStudentUpdate?: (updated: Student) => void;
}

type VersesWithMistakes = {
    [surahNum: number]: QuranVerse[];
};

const MistakesReviewPage: React.FC<MistakesReviewPageProps> = ({ student, showTitle = true, onBack, teacherId, onStudentUpdate }) => {
    const { t } = useI18n();
    const { currentUser } = useAuth();
    const [versesWithMistakes, setVersesWithMistakes] = useState<VersesWithMistakes>({});
    const [loading, setLoading] = useState(true);
    const [isExportingImage, setIsExportingImage] = useState(false);
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'specific'>('all');
    const [specificDate, setSpecificDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [isSharing, setIsSharing] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const [versePlays, setVersePlays] = useState<{ [verseKey: string]: number }>({});
    const [homeworkVerses, setHomeworkVerses] = useState<Set<string>>(new Set());
    const playChannelRef = useRef<any>(null);

    // Single source of truth: the UUID of this student's persistent report (null = not created yet)
    const [activeReportId, setActiveReportId] = useState<string | null>(null);
    // Verse keys that were manually removed this session — prevents processMistakes
    // from re-adding them when the student prop updates after onStudentUpdate.
    // useRef (not useState) so the value is always current inside the effect closure.
    const removedVerseKeysRef = useRef<Set<string>>(new Set());

    // Derived — no state needed; URL is always the same UUID
    const shareLink = activeReportId ? `${window.location.origin}/report/${activeReportId}` : null;

    // Serialised mistakes — used to detect real content changes without object-reference churn
    const mistakesKey = useMemo(() => JSON.stringify(student.mistakes), [student.mistakes]);
    // Tracks the last mistakes snapshot we pushed to the DB so we don't over-call
    const lastSyncedMistakesRef = useRef<string>('');

    // On mount: look up the existing report for this student so circles and homework persist.
    // IMPORTANT: set homeworkVerses BEFORE activeReportId so React 18 batches both into one
    // render — this prevents the auto-update effect from firing with empty homeworkVerses and
    // wiping previously saved homework from the DB.
    useEffect(() => {
        if (!teacherId || !student.id) return;
        getStudentReportId(teacherId, student.id).then(async id => {
            if (id) {
                const existing = await getSharedReport(id);
                if (existing?.report_data?.homeworkVerses?.length) {
                    setHomeworkVerses(new Set(existing.report_data.homeworkVerses));
                }
                // Set activeReportId LAST so the auto-update effect sees the correct homework
                setActiveReportId(id);
            }
        });
    }, [teacherId, student.id]);

    // Auto-update the shared report whenever mistakes change (only when a report already exists
    // and we're showing all mistakes so the verse list is complete)
    useEffect(() => {
        if (!activeReportId || loading || dateFilter !== 'all') return;
        if (Object.keys(versesWithMistakes).length === 0) return;
        if (mistakesKey === lastSyncedMistakesRef.current) return; // nothing changed
        lastSyncedMistakesRef.current = mistakesKey;

        const tid = teacherId ?? (currentUser?.role === 'teacher' ? currentUser.id : null);
        if (!tid) return;

        const verseList = (Object.values(versesWithMistakes).flat() as QuranVerse[])
            .map(v => ({ verse_key: v.verse_key, text_uthmani: v.text_uthmani }));

        // Fire-and-forget — silent background sync, no loading indicators
        createOrUpdateSharedReport(tid, student.id, student.name, {
            studentName: student.name,
            generatedAt: new Date().toISOString(),
            mistakes: student.mistakes || {},
            verses: verseList,
            homeworkVerses: [...homeworkVerses],
            quranicFont: localStorage.getItem('quranicFont') || 'Hafs',
            studentProgress: {
                recitationAchievements: student.recitationAchievements || [],
                memorizationAchievements: student.memorizationAchievements || [],
                attendance: student.attendance || [],
                masteredTajweedRules: student.masteredTajweedRules || [],
                dob: student.dob,
                tafsirReviews: student.tafsirReviews || [],
                tafsirMemorizationReviews: student.tafsirMemorizationReviews || [],
            },
        }).catch(e => console.error('Auto-update shared report:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeReportId, loading, versesWithMistakes, mistakesKey, dateFilter]);

    // Subscribe to play events + load historical plays whenever a report exists
    useEffect(() => {
        if (!activeReportId) return;

        getReportPlays(activeReportId).then(plays => setVersePlays(plays));

        const ch = supabase.channel(`report-plays-${activeReportId}`);
        ch.on('broadcast', { event: 'play' }, ({ payload }) => {
            const vk = payload?.verse_key as string | undefined;
            if (vk) setVersePlays(prev => ({ ...prev, [vk]: (prev[vk] ?? 0) + 1 }));
        }).subscribe();

        playChannelRef.current = ch;
        return () => { ch.unsubscribe(); playChannelRef.current = null; };
    }, [activeReportId]);

    useEffect(() => {
        const processMistakes = async () => {
            setLoading(true);
            const mistakes = student.mistakes || {};
            let mistakeKeys = Object.keys(mistakes);

            // Filter mistakes by date
            if (dateFilter !== 'all') {
                let targetDate: string;
                if (dateFilter === 'today') {
                    targetDate = new Date().toISOString().split('T')[0];
                } else {
                    targetDate = specificDate;
                }

                mistakeKeys = mistakeKeys.filter(key => {
                    const mistake = mistakes[key];
                    if (!mistake || !mistake.date) return false;
                    const mistakeDate = new Date(mistake.date).toISOString().split('T')[0];
                    return mistakeDate === targetDate;
                });
            }

            if (mistakeKeys.length === 0) {
                setVersesWithMistakes({});
                setLoading(false);
                return;
            }

            const surahsToFetch = new Set<number>();
            const mistakesByVerse: { [verseKey: string]: boolean } = {};
            mistakeKeys.forEach(key => {
                const [surah] = key.split(':').map(Number);
                const verseKey = key.split(':').slice(0, 2).join(':');
                surahsToFetch.add(surah);
                mistakesByVerse[verseKey] = true;
            });

            try {
                const surahPromises = Array.from(surahsToFetch).map(async surahId => {
                    const response = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${surahId}`);
                    if (!response.ok) throw new Error(`Failed to fetch Surah ${surahId}`);
                    const data = await response.json();
                    return { surahId, verses: data.verses as QuranVerse[] };
                });

                const fetchedSurahs = await Promise.all(surahPromises);
                const allVersesMap: { [surahId: number]: QuranVerse[] } = {};
                fetchedSurahs.forEach(s => {
                    allVersesMap[s.surahId] = s.verses;
                });
                
                const result: VersesWithMistakes = {};
                for (const surahId of Array.from(surahsToFetch).sort((a,b) => a-b)) {
                    const versesInSurah = allVersesMap[surahId];
                    if (versesInSurah) {
                        const versesContainingMistakes = versesInSurah.filter(v =>
                            mistakesByVerse[v.verse_key] &&
                            // Exclude verses the teacher explicitly removed this session
                            !removedVerseKeysRef.current.has(v.verse_key)
                        );
                        if(versesContainingMistakes.length > 0) {
                            result[surahId] = versesContainingMistakes;
                        }
                    }
                }
                setVersesWithMistakes(result);
            } catch (error) {
                console.error("Failed to load verses for mistakes review:", error);
            } finally {
                setLoading(false);
            }
        };

        processMistakes();
    }, [student.mistakes, dateFilter, specificDate]);

    const [isImageExportMode, setIsImageExportMode] = useState(false);

    // Helper function to get image export library
    const getImageExportLibrary = () => {
        const win = window as any;
        // rasterizeHTML.js is the primary library
        const rasterizeHTML = win.rasterizeHTML;
        
        // Fallback to html2canvas if rasterizeHTML is not available
        const html2canvasLib = win.html2canvas;
        
        return { rasterizeHTML, html2canvasLib };
    };

    const handleExportAsImage = async () => {
        // Wait a bit for libraries to load if they're still loading
        let attempts = 0;
        let { rasterizeHTML, html2canvasLib } = getImageExportLibrary();
        
        while (!rasterizeHTML && !html2canvasLib && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 100));
            ({ rasterizeHTML, html2canvasLib } = getImageExportLibrary());
            attempts++;
        }
        
        if (!rasterizeHTML && !html2canvasLib) {
            alert('Image export library is not loaded. Please refresh the page and try again.');
            return;
        }

        setIsExportingImage(true);
        setIsImageExportMode(true); // Enable image-optimized rendering
        
        const element = document.getElementById('mistakes-review-content');
        if (!element) {
            console.error('Export failed: Could not find element #mistakes-review-content');
            setIsExportingImage(false);
            setIsImageExportMode(false);
            return;
        }

        const isDarkMode = document.documentElement.classList.contains('dark');
        const isReadingMode = document.documentElement.getAttribute('data-theme') === 'reading';
        
        // Prepare DOM for capture
        if (isDarkMode) document.documentElement.classList.remove('dark');
        if (isReadingMode) document.documentElement.removeAttribute('data-theme');

        try {
            // Force re-render with image export mode
            await new Promise(resolve => setTimeout(resolve, 200));

            // Wait for fonts to load
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
            }
            await new Promise(resolve => setTimeout(resolve, 300));

            let imageDataUrl: string;
            
            // Prefer rasterizeHTML if available, fallback to html2canvas
            if (rasterizeHTML) {
                // Use rasterizeHTML which handles text rendering better
                // It preserves fonts and text formatting more accurately by using SVG foreignObject
                // Create a canvas element for rendering
                const canvas = document.createElement('canvas');
                canvas.width = element.scrollWidth * 2; // Higher resolution
                canvas.height = element.scrollHeight * 2;
                
                // Create a temporary document with the element content
                // This ensures all styles are properly applied
                const tempDoc = document.implementation.createHTMLDocument('temp');
                const tempBody = tempDoc.body;
                
                // Copy all styles from the current document
                Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]')).forEach(style => {
                    tempDoc.head.appendChild(style.cloneNode(true));
                });
                
                // Clone the element and remove no-print elements
                const clonedElement = element.cloneNode(true) as HTMLElement;
                const noPrintElements = clonedElement.querySelectorAll('.no-print');
                noPrintElements.forEach(el => el.remove());
                
                // Append to temp document
                tempBody.appendChild(clonedElement);
                tempBody.style.margin = '0';
                tempBody.style.padding = '0';
                tempBody.style.backgroundColor = '#ffffff';
                
                // Render document to canvas using rasterizeHTML
                await rasterizeHTML.drawDocument(tempDoc, canvas);
                
                imageDataUrl = canvas.toDataURL('image/png', 1.0);
            } else if (html2canvasLib) {
                // Fallback to html2canvas with better settings for Arabic text
                const canvas = await html2canvasLib(element, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    allowTaint: false,
                    backgroundColor: '#ffffff',
                    onclone: (clonedDoc: Document) => {
                        // Ensure fonts are properly loaded in clone
                        const clonedElement = clonedDoc.getElementById('mistakes-review-content');
                        if (clonedElement) {
                            // Force font rendering
                            const style = clonedDoc.createElement('style');
                            style.textContent = `
                                * {
                                    -webkit-font-smoothing: antialiased;
                                    -moz-osx-font-smoothing: grayscale;
                                }
                            `;
                            clonedDoc.head.appendChild(style);
                        }
                    }
                });
                imageDataUrl = canvas.toDataURL('image/png', 1.0);
            } else {
                throw new Error('No image export library available');
            }

            // Create a temporary link to download
            const link = document.createElement('a');
            link.download = `${student.name.replace(/ /g, '_')}_mistakes_report.png`;
            link.href = imageDataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Return the image data URL
            return imageDataUrl;
        } catch (error) {
            console.error("Error generating image:", error);
            alert(`An error occurred while generating the image: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
            return null;
        } finally {
            // Cleanup DOM after capture
            if (isDarkMode) document.documentElement.classList.add('dark');
            if (isReadingMode) document.documentElement.setAttribute('data-theme', 'reading');
            setIsExportingImage(false);
            setIsImageExportMode(false);
        }
    };

    const handleExportToPdf = async () => {
        setIsExportingImage(true);
        setIsImageExportMode(true); // Enable image-optimized rendering
        
        const element = document.getElementById('mistakes-review-content');
        if (!element) {
            console.error('Export failed: Could not find element #mistakes-review-content');
            setIsExportingImage(false);
            setIsImageExportMode(false);
            return;
        }

        const isDarkMode = document.documentElement.classList.contains('dark');
        const isReadingMode = document.documentElement.getAttribute('data-theme') === 'reading';
        
        // Prepare DOM for capture
        if (isDarkMode) document.documentElement.classList.remove('dark');
        if (isReadingMode) document.documentElement.removeAttribute('data-theme');

        try {
            // Wait a bit for libraries to load if they're still loading
            let attempts = 0;
            let { rasterizeHTML, html2canvasLib } = getImageExportLibrary();
            
            while (!rasterizeHTML && !html2canvasLib && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 100));
                ({ rasterizeHTML, html2canvasLib } = getImageExportLibrary());
                attempts++;
            }
            
            if (!rasterizeHTML && !html2canvasLib) {
                alert('Image export library is not loaded. Please refresh the page and try again.');
                setIsImageExportMode(false);
                return;
            }

            // Check for jsPDF
            const jsPDF = (window as any).jspdf?.jsPDF;
            if (!jsPDF) {
                alert('PDF export library is not loaded. Please refresh the page and try again.');
                setIsImageExportMode(false);
                return;
            }

            // Force re-render with image export mode
            await new Promise(resolve => setTimeout(resolve, 200));

            // Wait for fonts to load
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
            }
            await new Promise(resolve => setTimeout(resolve, 300));

            let imageDataUrl: string;
            let imageWidth: number;
            let imageHeight: number;
            
            // Prefer rasterizeHTML if available, fallback to html2canvas
            if (rasterizeHTML) {
                // Use rasterizeHTML which handles text rendering better
                // It preserves fonts and text formatting more accurately by using SVG foreignObject
                // Create a canvas element for rendering
                const canvas = document.createElement('canvas');
                canvas.width = element.scrollWidth * 2; // Higher resolution
                canvas.height = element.scrollHeight * 2;
                imageWidth = canvas.width;
                imageHeight = canvas.height;
                
                // Create a temporary document with the element content
                // This ensures all styles are properly applied
                const tempDoc = document.implementation.createHTMLDocument('temp');
                const tempBody = tempDoc.body;
                
                // Copy all styles from the current document
                Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]')).forEach(style => {
                    tempDoc.head.appendChild(style.cloneNode(true));
                });
                
                // Clone the element and remove no-print elements
                const clonedElement = element.cloneNode(true) as HTMLElement;
                const noPrintElements = clonedElement.querySelectorAll('.no-print');
                noPrintElements.forEach(el => el.remove());
                
                // Append to temp document
                tempBody.appendChild(clonedElement);
                tempBody.style.margin = '0';
                tempBody.style.padding = '0';
                tempBody.style.backgroundColor = '#ffffff';
                
                // Render document to canvas using rasterizeHTML
                await rasterizeHTML.drawDocument(tempDoc, canvas);
                
                imageDataUrl = canvas.toDataURL('image/png', 1.0);
            } else if (html2canvasLib) {
                // Fallback to html2canvas with better settings for Arabic text
                const canvas = await html2canvasLib(element, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    allowTaint: false,
                    backgroundColor: '#ffffff',
                    onclone: (clonedDoc: Document) => {
                        // Ensure fonts are properly loaded in clone
                        const clonedElement = clonedDoc.getElementById('mistakes-review-content');
                        if (clonedElement) {
                            // Force font rendering
                            const style = clonedDoc.createElement('style');
                            style.textContent = `
                                * {
                                    -webkit-font-smoothing: antialiased;
                                    -moz-osx-font-smoothing: grayscale;
                                }
                            `;
                            clonedDoc.head.appendChild(style);
                        }
                    }
                });
                imageDataUrl = canvas.toDataURL('image/png', 1.0);
                imageWidth = canvas.width;
                imageHeight = canvas.height;
            } else {
                throw new Error('No image export library available');
            }

            // Create PDF using jsPDF
            // Calculate PDF dimensions (A4 size in mm)
            const pdfWidth = 210; // A4 width in mm
            const pdfHeight = 297; // A4 height in mm
            const imgAspectRatio = imageWidth / imageHeight;
            
            // Calculate dimensions to fit the image in A4
            let finalWidth = pdfWidth;
            let finalHeight = pdfWidth / imgAspectRatio;
            
            // If image is taller than A4, scale to fit height
            if (finalHeight > pdfHeight) {
                finalHeight = pdfHeight;
                finalWidth = pdfHeight * imgAspectRatio;
            }
            
            const pdf = new jsPDF({
                orientation: finalHeight > finalWidth ? 'portrait' : 'landscape',
                unit: 'mm',
                format: [finalWidth, finalHeight]
            });
            
            // Add image to PDF
            pdf.addImage(imageDataUrl, 'PNG', 0, 0, finalWidth, finalHeight);
            
            // Generate filename with student name and current date
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
            const studentName = student.name.replace(/ /g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            const fileName = `${studentName}_${dateStr}.pdf`;
            
            // Save PDF
            pdf.save(fileName);
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert(`An error occurred while generating the PDF: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
        } finally {
            // Cleanup DOM after capture
            if (isDarkMode) document.documentElement.classList.add('dark');
            if (isReadingMode) document.documentElement.setAttribute('data-theme', 'reading');
            setIsExportingImage(false);
            setIsImageExportMode(false);
        }
    };

    // ── Share handler — always upserts so the link never changes ────
    const handleShare = async () => {
        const tid = teacherId ?? (currentUser?.role === 'teacher' ? currentUser.id : null);
        if (!tid) return;

        setIsSharing(true);
        try {
            // Always save ALL mistakes (not filtered) so the student sees everything
            const verseList: Array<{ verse_key: string; text_uthmani: string }> =
                (Object.values(versesWithMistakes).flat() as QuranVerse[])
                    .map(v => ({ verse_key: v.verse_key, text_uthmani: v.text_uthmani }));

            const reportId = await createOrUpdateSharedReport(tid, student.id, student.name, {
                studentName: student.name,
                generatedAt: new Date().toISOString(),
                mistakes: student.mistakes || {},
                verses: verseList,
                homeworkVerses: [...homeworkVerses],
                quranicFont: localStorage.getItem('quranicFont') || 'Hafs',
                studentProgress: {
                    recitationAchievements: student.recitationAchievements || [],
                    memorizationAchievements: student.memorizationAchievements || [],
                    attendance: student.attendance || [],
                    masteredTajweedRules: student.masteredTajweedRules || [],
                    dob: student.dob,
                    tafsirReviews: student.tafsirReviews || [],
                    tafsirMemorizationReviews: student.tafsirMemorizationReviews || [],
                },
            });

            if (reportId) {
                setActiveReportId(reportId); // activates subscription if not already running
                const link = `${window.location.origin}/report/${reportId}`;
                await navigator.clipboard.writeText(link).catch(() => {});
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 3000);
            }
        } finally {
            setIsSharing(false);
        }
    };

    // ── Homework toggle ─────────────────────────────────────────────────────────
    const handleToggleHomework = async (verseKey: string) => {
        const wasAssigned = homeworkVerses.has(verseKey);
        const wasDone = wasAssigned && (versePlays[verseKey] ?? 0) >= 3;

        const next = new Set(homeworkVerses);
        if (wasAssigned) {
            next.delete(verseKey);
        } else {
            next.add(verseKey);
        }
        setHomeworkVerses(next);

        // Persist immediately if a report already exists; otherwise it's saved on next share
        if (activeReportId) {
            await updateHomeworkVerses(activeReportId, Array.from(next) as string[]);

            // Broadcast updated homework list so the student's page updates in real time (Bug 3 fix)
            playChannelRef.current?.send({
                type: 'broadcast',
                event: 'homework_update',
                payload: { homeworkVerses: Array.from(next) },
            });

            // When removing a completed homework verse, reset the play count so that
            // re-assigning it later starts the student fresh at 0/3.
            if (wasDone && wasAssigned) {
                await resetVersePlayCount(activeReportId, verseKey);
                setVersePlays(prev => {
                    const updated = { ...prev };
                    delete updated[verseKey];
                    return updated;
                });
                // Notify the student's sharable link so its in-memory count clears too
                playChannelRef.current?.send({
                    type: 'broadcast',
                    event: 'play_reset',
                    payload: { verse_key: verseKey },
                });
            }
        }
    };

    // ── Remove verse from review ────────────────────────────────────────────────
    const handleRemoveVerse = async (verseKey: string) => {
        const [surahNum, ayahNum] = verseKey.split(':').map(Number);

        // 1. Remove from local versesWithMistakes and guard against re-adds
        const newVWM = { ...versesWithMistakes };
        if (newVWM[surahNum]) {
            newVWM[surahNum] = newVWM[surahNum].filter(v => v.verse_key !== verseKey);
            if (newVWM[surahNum].length === 0) delete newVWM[surahNum];
        }
        setVersesWithMistakes(newVWM);
        // Mark as removed so processMistakes won't re-add it when the student prop changes.
        // Using ref (not state) ensures the closure inside the effect always sees the latest set.
        removedVerseKeysRef.current.add(verseKey);

        // 2. Turn all mistakes for this verse to level 1 (yellow) in the student record.
        //    Deliberately omit errorType and errorText so that in the live logging page
        //    letter-level mistakes render yellow (fallback) instead of red/green.
        const updatedMistakes = { ...student.mistakes };
        Object.keys(updatedMistakes).forEach(key => {
            if (key.startsWith(`${surahNum}:${ayahNum}:`)) {
                updatedMistakes[key] = { level: 1, date: updatedMistakes[key]?.date || new Date().toISOString() };
            }
        });
        const updatedStudent: Student = { ...student, mistakes: updatedMistakes };

        // 3. Also remove from homework if it was assigned
        const nextHW = new Set(homeworkVerses);
        if (nextHW.has(verseKey)) {
            nextHW.delete(verseKey);
            setHomeworkVerses(nextHW);
            if (activeReportId) {
                await updateHomeworkVerses(activeReportId, Array.from(nextHW) as string[]);
            }
        }

        // 4. Persist yellow mistakes to Supabase
        const tid = teacherId ?? (currentUser?.role === 'teacher' ? currentUser.id : null);
        if (tid) {
            saveStudent(tid, updatedStudent).catch(e => console.error('handleRemoveVerse saveStudent:', e));
        }

        // 5. Notify parent so the live session page reflects the change immediately
        onStudentUpdate?.(updatedStudent);

        // 6. Push updated shared report immediately (verse removed, mistakes yellowed)
        if (activeReportId && tid) {
            const newVerseList = (Object.values(newVWM).flat() as QuranVerse[])
                .map(v => ({ verse_key: v.verse_key, text_uthmani: v.text_uthmani }));
            createOrUpdateSharedReport(tid, student.id, student.name, {
                studentName: student.name,
                generatedAt: new Date().toISOString(),
                mistakes: updatedMistakes,
                verses: newVerseList,
                homeworkVerses: Array.from(nextHW) as string[],
                quranicFont: localStorage.getItem('quranicFont') || 'Hafs',
                studentProgress: {
                    recitationAchievements: student.recitationAchievements || [],
                    memorizationAchievements: student.memorizationAchievements || [],
                    attendance: student.attendance || [],
                    masteredTajweedRules: student.masteredTajweedRules || [],
                    dob: student.dob,
                    tafsirReviews: student.tafsirReviews || [],
                    tafsirMemorizationReviews: student.tafsirMemorizationReviews || [],
                },
            }).catch(e => console.error('handleRemoveVerse shared report:', e));

            // Broadcast so the student's open page removes the verse immediately (Bug 2 fix)
            playChannelRef.current?.send({
                type: 'broadcast',
                event: 'verse_removed',
                payload: { verse_key: verseKey },
            });
        }
    };

    // Helper function to process text and wrap U+06DF characters in Amiri font
    const processTextWithU06DF = (text: string): React.ReactNode => {
        if (!text.includes('\u06DF')) {
            return text;
        }
        const parts: React.ReactNode[] = [];
        let currentPart = '';
        let charIndex = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '\u06DF') {
                if (currentPart) {
                    parts.push(<span key={`part-${charIndex++}`}>{currentPart}</span>);
                    currentPart = '';
                }
                parts.push(
                    <span key={`u06df-${charIndex++}`} style={{ fontFamily: 'Amiri Regular' }}>
                        {'\u06DF'}
                    </span>
                );
            } else {
                currentPart += char;
            }
        }
        if (currentPart) {
            parts.push(<span key={`part-${charIndex++}`}>{currentPart}</span>);
        }
        return <>{parts}</>;
    };

    // Letter component - matches StudentProgressPage exactly for accurate highlighting
    const LetterForPDF: React.FC<{
        letter: string;
        letterKey: string;
        mistake: Mistake | undefined;
    }> = ({ letter, letterKey, mistake }) => {
        const getLetterColor = () => {
            if (mistake && mistake.errorText) {
                if (mistake.errorType === 'tajweed') return 'bg-green-100 dark:bg-green-900/40';
                if (mistake.errorType === 'reading') return 'bg-red-100 dark:bg-red-900/40';
            }
            return '';
        };

        return (
            <span 
                className="relative inline align-top" 
                style={{ 
                    display: 'inline', 
                    fontFamily: 'inherit',
                    letterSpacing: '0',
                    // Ensure no gaps between letters for proper Arabic rendering
                    margin: '0',
                    padding: '0'
                }}
            >
                {/* Annotation box for letters with mistakes */}
                {mistake && mistake.errorText && (
                    <div 
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 pointer-events-none"
                        style={{ 
                            zIndex: 40, 
                            whiteSpace: 'nowrap',
                            transform: 'translateX(-50%)'
                        }}
                    >
                                    <div className={`px-2 py-1 text-xs rounded shadow whitespace-nowrap max-w-[250px] font-medium ${
                            mistake.errorType === 'tajweed' 
                                ? 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-700'
                                : 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-700'
                        }`}>
                            {mistake.errorText}
                        </div>
                    </div>
                )}
                
                {/* Letter with background highlight - exactly like StudentProgressPage */}
                <span
                    className={`inline rounded transition-colors relative z-10 ${getLetterColor()}`}
                    style={{ 
                        display: 'inline', 
                        fontFamily: 'inherit', 
                        letterSpacing: '0', 
                        position: 'relative', 
                        zIndex: 10,
                        // Ensure no gaps
                        margin: '0',
                        padding: '0'
                    }}
                >
                    {letter.includes('\u06DF') ? (
                        letter.split('').map((char, idx) => 
                            char === '\u06DF' ? (
                                <span key={idx} style={{ fontFamily: 'Amiri Regular' }}>{char}</span>
                            ) : (
                                <span key={idx}>{char}</span>
                            )
                        )
                    ) : (
                        letter
                    )}
                </span>
            </span>
        );
    };

    const renderVerseContent = (verse: QuranVerse, forImageExport: boolean = false) => {
        const [surahNum, ayahNum] = verse.verse_key.split(':').map(Number);
        const words = verse.text_uthmani.replace(/\u0652/g, '\u06e1').split(' ');

        return words.map((word, wordIndex) => {
            const wordKey = `${surahNum}:${ayahNum}:${wordIndex}`;
            const wordMistake = student.mistakes[wordKey];
            const wordMistakeLevel = wordMistake?.level;
            
            // Parse word into letters for letter-level mistakes
            const letters = parseWordIntoLetters(word);
            
            // Check if this word has any letter-level mistakes with errorText
            const hasLetterMistakes = letters.some(({ index: letterIndex }) => {
                const letterKey = `${surahNum}:${ayahNum}:${wordIndex}:${letterIndex}`;
                const letterMistake = student.mistakes[letterKey];
                return letterMistake && letterMistake.errorText;
            });
            
            if (letters.length === 0 || !hasLetterMistakes) {
                // Fallback to word-level rendering if no letters found or no letter-level mistakes
                return (
                    <React.Fragment key={wordKey}>
                        <span className={`px-1 rounded-md ${wordMistakeLevel ? getMistakeColor(wordMistakeLevel) : ''}`}>
                            {processTextWithU06DF(word)}
                        </span>
                        {' '}
                    </React.Fragment>
                );
            }
            
            // Render each letter individually - same for both normal display and image export
            // This ensures accurate highlighting that matches StudentProgressPage exactly
            return (
                <span 
                    key={wordKey} 
                    className="relative inline" 
                    style={{ 
                        display: 'inline', 
                        fontFamily: 'inherit',
                        // Ensure letters stay together for proper Arabic ligatures
                        whiteSpace: 'nowrap',
                        letterSpacing: '0'
                    }}
                >
                    {letters.map(({ letter, index: letterIndex }) => {
                        const letterKey = `${surahNum}:${ayahNum}:${wordIndex}:${letterIndex}`;
                        const mistake = student.mistakes[letterKey];
                        
                        return (
                            <LetterForPDF
                                key={letterKey}
                                letter={letter}
                                letterKey={letterKey}
                                mistake={mistake}
                            />
                        );
                    })}
                    {' '}
                </span>
            );
        });
    };

    if (loading) {
        return <div className="text-center p-8">{t('liveSession.loadingSurah')}</div>;
    }

    if (Object.keys(versesWithMistakes).length === 0) {
        const filterMessage = dateFilter === 'today' 
            ? 'No mistakes marked today.'
            : dateFilter === 'specific'
            ? `No mistakes marked on ${new Date(specificDate).toLocaleDateString()}.`
            : 'No mistakes found.';
        
        return (
            <div className="space-y-6">
                {/* Date Filter */}
                <div className="flex flex-col sm:flex-row justify-end items-start sm:items-center gap-3 mb-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            Filter by Date:
                        </label>
                        <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'specific')}
                            className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-slate-700 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All Mistakes</option>
                            <option value="today">Today</option>
                            <option value="specific">Specific Date</option>
                        </select>
                    </div>
                    {dateFilter === 'specific' && (
                        <input
                            type="date"
                            value={specificDate}
                            onChange={(e) => setSpecificDate(e.target.value)}
                            className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-slate-700 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    )}
                </div>
                
                <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                    <p className="font-semibold text-lg text-slate-700 dark:text-slate-200">{t('studentView.noMistakesMashaAllah')}</p>
                    <p className="text-slate-500 dark:text-slate-400">{filterMessage}</p>
                </div>
            </div>
        );
    }

    return (
        <div id="mistakes-review-content" className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-2.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors"
                            aria-label="Back"
                            title="Back"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 rtl:rotate-180">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                            </svg>
                        </button>
                    )}
                    {showTitle && (
                        <h2 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
                            {t('studentView.mistakesReviewTab')}
                        </h2>
                    )}
                </div>
                
                {/* Date Filter */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            Filter by Date:
                        </label>
                        <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'specific')}
                            className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-slate-700 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All Mistakes</option>
                            <option value="today">Today</option>
                            <option value="specific">Specific Date</option>
                        </select>
                    </div>
                    {dateFilter === 'specific' && (
                        <input
                            type="date"
                            value={specificDate}
                            onChange={(e) => setSpecificDate(e.target.value)}
                            className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-slate-700 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    )}
                </div>
                
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportAsImage}
                        disabled={isExportingImage}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-wait"
                        title="Download as Image"
                    >
                        {isExportingImage ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="hidden sm:inline">Generating...</span>
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                </svg>
                                <span className="hidden sm:inline">Download Image</span>
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleExportToPdf}
                        disabled={isExportingImage}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500 dark:bg-red-600 text-white rounded-lg hover:bg-red-600 dark:hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
                        title="Export to PDF"
                    >
                        {isExportingImage ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="hidden sm:inline">Generating PDF...</span>
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                                <span className="hidden sm:inline">Export PDF</span>
                            </>
                        )}
                    </button>

                    {/* Share button */}
                    <button
                        onClick={handleShare}
                        disabled={isSharing}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
                        title="Generate shareable link for student"
                    >
                        {isSharing ? (
                            <>
                                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="hidden sm:inline">Generating…</span>
                            </>
                        ) : shareCopied ? (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                                </svg>
                                <span className="hidden sm:inline">Link Copied!</span>
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                                </svg>
                                <span className="hidden sm:inline">Share</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Share link display */}
            {shareLink && (
                <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3 text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-teal-600 flex-shrink-0">
                        <path fillRule="evenodd" d="M19.902 4.098a3.75 3.75 0 0 0-5.304 0l-4.5 4.5a3.75 3.75 0 0 0 1.035 6.037.75.75 0 0 1-.646 1.353 5.25 5.25 0 0 1-1.449-8.45l4.5-4.5a5.25 5.25 0 1 1 7.424 7.424l-1.757 1.757a.75.75 0 1 1-1.06-1.06l1.757-1.757a3.75 3.75 0 0 0 0-5.304Zm-7.389 4.267a.75.75 0 0 1 1-.353 5.25 5.25 0 0 1 1.449 8.45l-4.5 4.5a5.25 5.25 0 1 1-7.424-7.424l1.757-1.757a.75.75 0 1 1 1.06 1.06l-1.757 1.757a3.75 3.75 0 1 0 5.304 5.304l4.5-4.5a3.75 3.75 0 0 0-.354-5.304.75.75 0 0 1-.353-1Z" clipRule="evenodd" />
                    </svg>
                    <span className="text-teal-700 font-medium truncate flex-1">{shareLink}</span>
                    <button
                        onClick={async () => {
                            await navigator.clipboard.writeText(shareLink).catch(() => {});
                            setShareCopied(true);
                            setTimeout(() => setShareCopied(false), 3000);
                        }}
                        className="flex-shrink-0 px-3 py-1 bg-teal-600 text-white rounded text-xs hover:bg-teal-700 transition"
                    >
                        {shareCopied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
            )}

            {(Object.entries(versesWithMistakes) as [string, QuranVerse[]][])
                // Sort surah groups: newest mistake date first
                .sort(([, vA], [, vB]) => {
                    const newest = (vv: QuranVerse[]) => Math.max(0, ...vv.map(v => getVerseNewestTime(v.verse_key, student.mistakes || {})));
                    return newest(vB) - newest(vA);
                })
                .map(([surahNum, verses]: [string, QuranVerse[]]) => {
                // Sort verses within the surah: newest first
                const sortedVerses = [...verses].sort(
                    (a, b) => getVerseNewestTime(b.verse_key, student.mistakes || {}) - getVerseNewestTime(a.verse_key, student.mistakes || {})
                );
                const surahInfo = QURAN_METADATA.find(s => s.number === Number(surahNum));
                
                // Get the date of mistakes in this surah (use the first mistake's date as reference)
                const getSurahMistakeDate = () => {
                    const mistakes = student.mistakes || {};
                    for (const verse of verses) {
                        const [surahNum, ayahNum] = verse.verse_key.split(':').map(Number);
                        const words = verse.text_uthmani.replace(/\u0652/g, '\u06e1').split(' ');
                        
                        // Check letter-level mistakes first
                        for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
                            const letters = parseWordIntoLetters(words[wordIndex]);
                            for (let letterIndex = 0; letterIndex < letters.length; letterIndex++) {
                                const letterKey = `${surahNum}:${ayahNum}:${wordIndex}:${letterIndex}`;
                                const mistake = mistakes[letterKey];
                                if (mistake && mistake.date) {
                                    return new Date(mistake.date).toLocaleDateString();
                                }
                            }
                        }
                        
                        // Check word-level mistakes
                        for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
                            const wordKey = `${surahNum}:${ayahNum}:${wordIndex}`;
                            const mistake = mistakes[wordKey];
                            if (mistake && mistake.date) {
                                return new Date(mistake.date).toLocaleDateString();
                            }
                        }
                    }
                    return null;
                };
                
                const mistakeDate = getSurahMistakeDate();
                
                return (
                    <div key={surahNum} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm break-inside-avoid">
                        <div className="flex justify-between items-center mb-4 pb-2 border-b dark:border-gray-700">
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                                {surahInfo?.number}. {surahInfo?.name} ({surahInfo?.transliteratedName})
                            </h3>
                            {mistakeDate && (
                                <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                                    {mistakeDate}
                                </span>
                            )}
                        </div>
                        <div dir="rtl" className="font-quranic text-slate-800 dark:text-slate-100 text-center" style={{ fontSize: '5rem', lineHeight: '4rem' }}>
                            {sortedVerses.map(verse => {
                                const ayahNum = Number(verse.verse_key.split(':')[1]);
                                // Check if this verse has any letter-level mistakes with annotation boxes
                                const [surahNum, ayahNumCheck] = verse.verse_key.split(':').map(Number);
                                const words = verse.text_uthmani.replace(/\u0652/g, '\u06e1').split(' ');
                                const hasLetterMistakes = words.some((word, wordIndex) => {
                                    const letters = parseWordIntoLetters(word);
                                    return letters.some(({ index: letterIndex }) => {
                                        const letterKey = `${surahNum}:${ayahNumCheck}:${wordIndex}:${letterIndex}`;
                                        const letterMistake = student.mistakes[letterKey];
                                        return letterMistake && letterMistake.errorText;
                                    });
                                });
                                
                                const playCount = versePlays[verse.verse_key] ?? 0;
                                const isHomework = homeworkVerses.has(verse.verse_key);
                                const homeworkDone = isHomework && playCount >= 3;

                                return (
                                     <div
                                        key={verse.verse_key}
                                        className={`relative flex flex-row-reverse items-start gap-x-2 border-b border-gray-100 dark:border-gray-700 ${isHomework ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
                                        style={{
                                            minHeight: hasLetterMistakes ? 'auto' : 'auto',
                                            paddingTop: hasLetterMistakes ? '3.5rem' : '2.5rem',
                                            paddingBottom: hasLetterMistakes ? '0.5rem' : '0.5rem',
                                            marginBottom: '0.75rem'
                                        }}
                                    >
                                        {/* Play circles + homework button — top-left overlay */}
                                        <div className="no-print absolute top-1.5 left-2 flex items-center gap-2 z-10">
                                            {/* Listen circles */}
                                            {playCount > 0 && (
                                                <div className="flex items-center gap-1" title={`Listened ${playCount} time${playCount !== 1 ? 's' : ''}`}>
                                                    {Array.from({ length: Math.min(playCount, 5) }).map((_, i) => (
                                                        <span
                                                            key={i}
                                                            className="block w-2.5 h-2.5 rounded-full bg-teal-500 shadow-sm"
                                                            style={{ opacity: 0.6 + i * 0.08 }}
                                                        />
                                                    ))}
                                                    {playCount > 5 && (
                                                        <span className="text-xs font-bold text-teal-600 dark:text-teal-400 leading-none">
                                                            +{playCount - 5}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {/* Homework toggle button */}
                                            <button
                                                onClick={() => handleToggleHomework(verse.verse_key)}
                                                title={homeworkDone ? 'Homework done — click to re-assign' : isHomework ? 'Remove from homework' : 'Assign as homework'}
                                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all ${
                                                    homeworkDone
                                                        ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-300 dark:border-green-600'
                                                        : isHomework
                                                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-600'
                                                            : 'bg-slate-100 dark:bg-gray-700 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-gray-600 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300'
                                                }`}
                                            >
                                                {homeworkDone ? (
                                                    <>
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                                                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                                        </svg>
                                                        Done
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                                                            <path fillRule="evenodd" d="M10 2c-1.716 0-3.408.106-5.07.31C3.806 2.45 3 3.346 3 4.445V19.5l7-3.111 7 3.111V4.445c0-1.1-.806-1.994-1.93-2.135A48.17 48.17 0 0 0 10 2Z" clipRule="evenodd" />
                                                        </svg>
                                                        {isHomework ? `Homework ${Math.min(playCount, 3)}/3` : 'Assign'}
                                                    </>
                                                )}
                                            </button>

                                            {/* Divider */}
                                            <span className="w-px h-3.5 bg-slate-200 dark:bg-gray-600 mx-0.5 flex-shrink-0" />

                                            {/* Remove verse button */}
                                            <button
                                                onClick={() => handleRemoveVerse(verse.verse_key)}
                                                title="Remove this verse from mistakes review (mistakes turn yellow)"
                                                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-50 dark:bg-gray-700 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-all"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 10.163 4 11 4H10ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                                                </svg>
                                                Remove
                                            </button>
                                        </div>

                                        <span className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 mx-1 font-mono text-sm font-bold text-slate-700 dark:text-slate-200 border-2 rounded-full font-sans" style={{ verticalAlign: 'middle' }}>
                                            {toEasternArabicNumerals(ayahNum)}
                                        </span>
                                        <span
                                            className="flex-grow text-center"
                                            style={{
                                                fontSize: '7rem',
                                                lineHeight: '10rem',
                                                fontFamily: 'inherit',
                                                display: 'block',
                                                wordWrap: 'break-word',
                                                overflowWrap: 'break-word'
                                            }}
                                        >
                                            {renderVerseContent(verse, isImageExportMode)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default MistakesReviewPage;