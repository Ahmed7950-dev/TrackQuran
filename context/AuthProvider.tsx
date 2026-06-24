import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthenticatedUser, TeacherUser, StudentUser } from '../types';
import { supabase } from '../lib/supabase';
import * as dataService from '../services/dataService';

interface AuthContextType {
  currentUser: AuthenticatedUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  signup: (name: string, email: string, password: string) => Promise<{ error: string | null }>;
  studentLogin: (firstName: string, lastName: string, dob: string) => Promise<StudentUser | null>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Fetch the role column from the profiles table.
// Kept separate so the role is always read from the DB (not stale metadata).
const fetchRole = async (userId: string): Promise<'teacher' | 'admin'> => {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin' ? 'admin' : 'teacher';
};

// Build a TeacherUser from a Supabase session + a resolved role.
const buildTeacherUser = (session: Session, role: 'teacher' | 'admin'): TeacherUser => {
  const meta = session.user.user_metadata ?? {};
  const name =
    meta.name ||
    meta.full_name ||
    session.user.email?.split('@')[0] ||
    'Teacher';
  return {
    id:       session.user.id,
    email:    session.user.email ?? '',
    name,
    provider: session.user.app_metadata?.provider === 'google' ? 'google' : 'email',
    role,
  };
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading]         = useState(true);

  // Subscribe to Supabase auth events.
  // INITIAL_SESSION fires immediately on mount from localStorage — no network
  // lock — so subsequent auth calls (login) are never blocked.
  // Role is fetched from the DB once per session event; the 4-second safety
  // timeout ensures we never spin forever if the DB is unreachable.
  useEffect(() => {
    let initialized = false;
    let cancelled   = false;

    const resolveUser = async (session: Session, ensureProfileExists = false) => {
      if (ensureProfileExists) {
        // Guarantee a profiles row exists before we do anything else.
        // Critical for Google OAuth: the email signup flow calls createTeacherProfile
        // explicitly, but OAuth bypasses that flow entirely — the first SIGNED_IN
        // event for a new Google account would otherwise find no profiles row,
        // causing saveStudent() to fail silently (FK / RLS violation) and the
        // student to disappear on next page refresh.
        const meta = session.user.user_metadata ?? {};
        const name =
          meta.name || meta.full_name ||
          session.user.email?.split('@')[0] || 'Teacher';
        await dataService.createTeacherProfile(session.user.id, name);
      }
      const role = await fetchRole(session.user.id);
      if (!cancelled) setCurrentUser(buildTeacherUser(session, role));
    };

    const markDone = () => {
      if (!initialized) { initialized = true; if (!cancelled) setLoading(false); }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session) {
          // Page refresh / tab restore — optimistically set user from session
          // immediately so the app never flickers to the login page while the
          // DB role fetch is in-flight (critical on slow mobile connections).
          if (!cancelled) setCurrentUser(buildTeacherUser(session, 'teacher'));
          resolveUser(session, false).then(markDone).catch(() => {
            // Role fetch failed but session is valid — keep the optimistic user.
            markDone();
          });
        } else {
          markDone();
        }
      } else if (event === 'SIGNED_IN' && session) {
        // Fresh sign-in (email or Google OAuth). Pass ensureProfileExists=true so
        // first-time Google users get their profiles row created before any DB writes.
        resolveUser(session, true).catch(console.error);
      } else if (event === 'TOKEN_REFRESHED') {
        // Supabase already updated its internal session — no need to touch
        // currentUser here. Calling resolveUser / setCurrentUser would create
        // a new object reference, retrigger the data-loading useEffect in App,
        // and risk clearing the student list if that refetch returns empty.
      } else if (event === 'SIGNED_OUT') {
        if (!cancelled) setCurrentUser(null);
      }
    });

    // Safety fallback: stop the spinner after 10 s if INITIAL_SESSION never fires.
    const timer = setTimeout(markDone, 10000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  // ── Teacher email+password login ─────────────────────────────
  const login = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
    // currentUser is set via onAuthStateChange SIGNED_IN above
  }, []);

  // ── Teacher sign-up (creates auth user + profile row) ────────
  const signup = useCallback(async (
    name: string, email: string, password: string,
  ): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }, // stored in raw_user_meta_data → trigger picks it up
    });
    if (error) return { error: error.message };
    // Profile row is created by the database trigger handle_new_user().
    // If for any reason the trigger didn't fire, create it manually.
    if (data.user) {
      await dataService.createTeacherProfile(data.user.id, name);
    }
    return { error: null };
  }, []);

  // ── Student login (name + dob, no auth account) ──────────────
  const studentLogin = useCallback(async (
    firstName: string, lastName: string, dob: string,
  ): Promise<StudentUser | null> => {
    const result = await dataService.findStudentByNameAndDob(firstName, lastName, dob);
    if (!result) return null;
    const studentUser: StudentUser = {
      role:      'student',
      student:   result.student,
      teacherId: result.teacherId,
    };
    setCurrentUser(studentUser);
    return studentUser;
  }, []);

  // ── Google OAuth ──────────────────────────────────────────────
  const signInWithGoogle = useCallback(async (): Promise<void> => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // Always show Google's account chooser so the user can pick a different
        // account instead of being silently signed in with the last one.
        queryParams: { prompt: 'select_account' },
      },
    });
    // Supabase redirects the browser; currentUser is set via onAuthStateChange after redirect.
  }, []);

  // ── Logout ────────────────────────────────────────────────────
  const logout = useCallback(async (): Promise<void> => {
    if (currentUser?.role === 'student') {
      // Students have no Supabase session — just clear local state
      setCurrentUser(null);
      return;
    }
    await supabase.auth.signOut();
    // setCurrentUser(null) is handled by onAuthStateChange SIGNED_OUT event
  }, [currentUser]);

  const value: AuthContextType = { currentUser, loading, login, signup, studentLogin, signInWithGoogle, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Safe default returned when useAuth is called outside an AuthProvider (e.g. public shared-report pages). */
const AUTH_GUEST: AuthContextType = {
  currentUser: null,
  loading: false,
  login: async () => ({ error: 'Not authenticated' }),
  signup: async () => ({ error: 'Not authenticated' }),
  studentLogin: async () => null,
  signInWithGoogle: async () => {},
  logout: async () => {},
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  // Return safe guest defaults when used outside an AuthProvider (public pages).
  if (!ctx) return AUTH_GUEST;
  return ctx;
};
