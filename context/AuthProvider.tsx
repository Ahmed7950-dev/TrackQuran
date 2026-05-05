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

// Build a TeacherUser synchronously from a Supabase session.
// Reads name from session metadata (set at sign-up / by Google OAuth) so
// no extra network call is needed during the auth flow.
const buildTeacherUser = (session: Session): TeacherUser => {
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
    role:     'teacher',
  };
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading]         = useState(true);

  // Subscribe to Supabase auth events.
  // INITIAL_SESSION fires immediately on mount from localStorage — no network
  // call, no internal lock — so subsequent auth calls are never blocked.
  useEffect(() => {
    let initialized = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        // Always fires first, even if session is null (logged-out state)
        if (session) setCurrentUser(buildTeacherUser(session));
        initialized = true;
        setLoading(false);
      } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        setCurrentUser(buildTeacherUser(session));
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      }
    });

    // Safety fallback: if INITIAL_SESSION never fires within 4 seconds,
    // stop the loading spinner so the user isn't stuck on a blank screen.
    const timer = setTimeout(() => {
      if (!initialized) {
        initialized = true;
        setLoading(false);
      }
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []); // no deps — buildTeacherUser is a module-level function, not a closure

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
      options: { redirectTo: window.location.origin },
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

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
