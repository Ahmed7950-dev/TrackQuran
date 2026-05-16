// components/FamilyLinkModal.tsx
// ---------------------------------------------------------------------------
// Teacher UI to create and manage "family links" — one URL that shows
// multiple siblings' progress to their parents.
// ---------------------------------------------------------------------------

import React, { useEffect, useState, useCallback } from 'react';
import { Student, ArabicStudent } from '../types';
import {
  FamilyLink, FamilyMember,
  getFamilyLinks, saveFamilyLink, deleteFamilyLink,
} from '../services/familyLinkService';
import { getStudentReportId, createOrUpdateSharedReport } from '../services/dataService';
import { ensureShareToken } from '../services/arabicService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
  quranStudents: Student[];
  arabicStudents: ArabicStudent[];
  onUpdateArabicStudent: (s: ArabicStudent) => void;
}

function buildMinimalReportData(student: Student) {
  return {
    studentName: student.name,
    generatedAt: new Date().toISOString(),
    mistakes: student.mistakes ?? {},
    verses: [] as { verse_key: string; text_uthmani: string }[],
    studentProgress: {
      recitationAchievements: student.recitationAchievements,
      memorizationAchievements: student.memorizationAchievements,
      attendance: student.attendance,
      masteredTajweedRules: student.masteredTajweedRules,
      dob: student.dob,
      tafsirReviews: student.tafsirReviews,
      tafsirMemorizationReviews: student.tafsirMemorizationReviews,
    },
  };
}

const FamilyLinkModal: React.FC<Props> = ({
  isOpen, onClose, teacherId, quranStudents, arabicStudents, onUpdateArabicStudent,
}) => {
  // ── ALL hooks must be declared before any conditional return ─────────────
  const [links, setLinks] = useState<FamilyLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [selectedQuranIds, setSelectedQuranIds] = useState<Set<string>>(new Set());
  const [selectedArabicIds, setSelectedArabicIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!teacherId) return;
    setLoading(true);
    getFamilyLinks(teacherId).then(ls => { setLinks(ls); setLoading(false); });
  }, [teacherId]);

  useEffect(() => { if (isOpen) reload(); }, [isOpen, reload]);

  // ── Conditional render after all hooks ───────────────────────────────────
  if (!isOpen) return null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const toggleQuran = (id: string) =>
    setSelectedQuranIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleArabic = (id: string) =>
    setSelectedArabicIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const openNew = () => {
    setEditingId(null);
    setFamilyName('');
    setSelectedQuranIds(new Set());
    setSelectedArabicIds(new Set());
    setShowForm(true);
  };

  const openEdit = (link: FamilyLink) => {
    setEditingId(link.id);
    setFamilyName(link.name);
    // Re-hydrate selected sets from stored members
    const qIds = new Set(
      link.members
        .filter(m => m.type === 'quran')
        .map(m => (m as any)._studentId ?? '')
        .filter(Boolean)
    );
    const aIds = new Set(
      link.members
        .filter(m => m.type === 'arabic')
        .map(m => arabicStudents.find(s => s.shareToken === m.share_token)?.id ?? '')
        .filter(Boolean)
    );
    setSelectedQuranIds(qIds);
    setSelectedArabicIds(aIds);
    setShowForm(true);
  };

  const cancelForm = () => setShowForm(false);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!familyName.trim()) return;
    if (selectedQuranIds.size === 0 && selectedArabicIds.size === 0) return;
    setSaving(true);
    try {
      const members: FamilyMember[] = [];

      for (const sid of Array.from(selectedQuranIds)) {
        const student = quranStudents.find(s => s.id === sid);
        if (!student) continue;
        let reportId = await getStudentReportId(teacherId, sid);
        if (!reportId) {
          reportId = await createOrUpdateSharedReport(
            teacherId, sid, student.name, buildMinimalReportData(student) as any,
          );
        }
        if (!reportId) continue;
        members.push({ id: crypto.randomUUID(), name: student.name, type: 'quran', report_id: reportId });
      }

      for (const sid of Array.from(selectedArabicIds)) {
        const student = arabicStudents.find(s => s.id === sid);
        if (!student) continue;
        const token = await ensureShareToken(student);
        if (!student.shareToken) onUpdateArabicStudent({ ...student, shareToken: token });
        members.push({ id: crypto.randomUUID(), name: student.name, type: 'arabic', share_token: token });
      }

      const id = editingId ?? crypto.randomUUID();
      const savedId = await saveFamilyLink({ id, teacher_id: teacherId, name: familyName.trim(), members });

      // Copy the link right away for new links
      if (!editingId) {
        const url = `${window.location.origin}/family/${savedId}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        setCopiedId(savedId);
        setTimeout(() => setCopiedId(null), 2500);
      }

      setShowForm(false);
      reload();
    } catch (err) {
      console.error('handleSave:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Copy link ─────────────────────────────────────────────────────────────
  const copyLink = async (link: FamilyLink) => {
    const url = `${window.location.origin}/family/${link.id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    await deleteFamilyLink(id);
    setDeleteConfirmId(null);
    reload();
  };

  const canSave = familyName.trim().length > 0 && (selectedQuranIds.size > 0 || selectedArabicIds.size > 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            👨‍👩‍👧‍👦 Family Links
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── List view ── */}
          {!showForm && (
            <>
              <button
                onClick={openNew}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create New Family Link
              </button>

              {loading && (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
                </div>
              )}

              {!loading && links.length === 0 && (
                <div className="text-center py-8 text-slate-400 dark:text-slate-500">
                  <p className="text-4xl mb-2">🔗</p>
                  <p className="text-sm">No family links yet. Create one to share with parents.</p>
                </div>
              )}

              {links.map(link => {
                const qCount = link.members.filter(m => m.type === 'quran').length;
                const aCount = link.members.filter(m => m.type === 'arabic').length;
                const subtitle = [
                  qCount > 0 ? `${qCount} Quran` : '',
                  aCount > 0 ? `${aCount} Arabic` : '',
                ].filter(Boolean).join(', ');

                return (
                  <div key={link.id} className="bg-slate-50 dark:bg-gray-700 rounded-xl border border-slate-200 dark:border-gray-600 p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{link.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {link.members.length} {link.members.length === 1 ? 'child' : 'children'}{subtitle ? ` · ${subtitle}` : ''}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {link.members.map(m => (
                            <span key={m.id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              m.type === 'quran'
                                ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                                : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                            }`}>
                              {m.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => openEdit(link)}
                          title="Edit"
                          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-gray-600 text-slate-500 dark:text-slate-400 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                          </svg>
                        </button>
                        {deleteConfirmId === link.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(link.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 text-xs bg-slate-200 dark:bg-gray-600 text-slate-700 dark:text-slate-300 rounded-lg">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(link.id)}
                            title="Delete"
                            className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => copyLink(link)}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        copiedId === link.id
                          ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                          : 'bg-white dark:bg-gray-600 border-slate-200 dark:border-gray-500 text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-300 hover:text-teal-700'
                      }`}
                    >
                      {copiedId === link.id ? (
                        <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> Link copied!</>
                      ) : (
                        <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg> Copy family link</>
                      )}
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/* ── Create / Edit form ── */}
          {showForm && (
            <div className="space-y-5">
              <button onClick={cancelForm} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                Back to list
              </button>

              <h3 className="font-bold text-slate-700 dark:text-slate-200">
                {editingId ? 'Edit Family Link' : 'New Family Link'}
              </h3>

              {/* Family name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Family name</label>
                <input
                  value={familyName}
                  onChange={e => setFamilyName(e.target.value)}
                  placeholder="e.g. Al-Hassan Family"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-100"
                />
              </div>

              {/* Quran students */}
              {quranStudents.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">📖 Quran Students</label>
                  <div className="space-y-2">
                    {quranStudents.map(s => {
                      const checked = selectedQuranIds.has(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleQuran(s.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                            checked
                              ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-600'
                              : 'bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 hover:border-teal-200'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-teal-600 border-teal-600' : 'border-slate-300 dark:border-gray-500'}`}>
                            {checked && <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="white" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                          </div>
                          <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-700 dark:text-teal-300 font-bold text-xs flex-shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Arabic students */}
              {arabicStudents.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                    <span style={{ fontFamily: 'Amiri Regular, serif' }}>العربية</span> Arabic Students
                  </label>
                  <div className="space-y-2">
                    {arabicStudents.map(s => {
                      const checked = selectedArabicIds.has(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleArabic(s.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                            checked
                              ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-600'
                              : 'bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 hover:border-amber-200'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-amber-500 border-amber-500' : 'border-slate-300 dark:border-gray-500'}`}>
                            {checked && <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="white" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                          </div>
                          <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-700 dark:text-amber-300 font-bold text-xs flex-shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {quranStudents.length === 0 && arabicStudents.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">No students found. Add students first.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {showForm && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-gray-700 flex-shrink-0 flex gap-3">
            <button
              onClick={cancelForm}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-gray-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Saving…</>
              ) : editingId ? 'Save Changes' : 'Create & Copy Link'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FamilyLinkModal;
