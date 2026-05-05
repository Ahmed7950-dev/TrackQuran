import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import type { Session, AuthError } from '@supabase/supabase-js';
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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading]         = useState(true);

  // Build a TeacherUser from a Supabase session
  const buildTeacherUser = useCallback(async (session: Session): Promise<TeacherUser> => {
    const profile = await dataService.getTeacherProfile(session.user.id);
    const name = profile?.name
      ?? session.user.user_metadata?.name
      ?? session.user.email?.split('@')[0]
      ?? 'Teacher';
    return {
      id:       session.user.id,
      email:    session.user.email ?? '',
      name,
      provider: (session.user.app_metadata?.provider === 'google' ? 'google' : 'email'),
      role:     'teacher',
    };
  }, []);

  // On mount: restore session from Supabase (handles page refresh)
  useEffect(() => {
    const restore = async () => {
      try {
        // Safety timeout — if Supabase hangs (e.g. stale token, network issue),
        // we fall through to the login page instead of staying on a blank screen.
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
        ]);
        if (sessionResult && (sessionResult as any).data?.session) {
          const session = (sessionResult as any).data.session;
          const teacher = await buildTeacherUser(session);
          setCurrentUser(teacher);
        }
      } catch (err) {
        console.warn('Session restore failed:', err);
      } finally {
        setLoading(false);
      }
    };
    restore();

    // Listen for auth state changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const teacher = await buildTeacherUser(session);
        setCurrentUser(teacher);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [buildTeacherUser]);

  // ── Teacher email+password login ─────────────────────────────
  const login = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    // Clear any stale local session before signing in.
    // This prevents the Supabase client from hanging on a background token
    // refresh from a previous session, which causes signInWithPassword to never resolve.
    await supabase.auth.signOut({ scope: 'local' });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
    // currentUser is set via onAuthStateChange above
  }, []);

  // ── Teacher sign-up (creates auth user + profile row) ────────
  const signup = useCallback(async (
    name: string, email: string, password: string,
  ): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },  // stored in raw_user_meta_data → trigger picks it up
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

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
