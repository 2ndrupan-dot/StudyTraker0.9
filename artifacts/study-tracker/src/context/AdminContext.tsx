import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  collection, doc, getDoc, setDoc,
  query, where, onSnapshot, addDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './AuthContext';

// Super admins from env var (cannot be removed)
const SUPER_ADMIN_EMAILS: string[] = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

export interface SharePermissions {
  editNotes: boolean;
  deleteNotes: boolean;
  downloadNotes: boolean;
  copyNotes: boolean;
}

export interface ShareRequest {
  id: string;
  fromAdminUid: string;
  fromAdminEmail: string;
  fromAdminName: string;
  toEmail: string;
  type: 'course' | 'note';
  // Course share
  courseId?: string;
  courseName?: string;
  // Note share
  noteTitle?: string;
  noteHtml?: string;
  noteBreadcrumb?: string[];
  // Common
  permissions: SharePermissions;
  durationValue: number;
  durationUnit: 'hours' | 'days' | 'months';
  status: 'pending' | 'accepted' | 'declined';
  sentAt: number;
  pendingExpiresAt: number; // auto-expire the pending notification
  acceptedAt?: number;
  actualExpiresAt?: number; // when access expires after acceptance
}

interface AdminContextType {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  adminEmails: string[];
  loadingAdmins: boolean;
  addAdmin: (email: string) => Promise<void>;
  removeAdmin: (email: string) => Promise<void>;
  sendShare: (params: SendShareParams) => Promise<void>;
  sentShares: ShareRequest[];
  loadingSentShares: boolean;
  updateSharePermissions: (shareId: string, permissions: SharePermissions) => Promise<void>;
  cancelShare: (shareId: string) => Promise<void>;
  pendingShares: ShareRequest[];
  acceptShare: (shareId: string) => Promise<void>;
  declineShare: (shareId: string) => Promise<void>;
  acceptedShares: ShareRequest[];
}

export type SendShareParams = Pick<ShareRequest,
  'toEmail' | 'type' | 'courseId' | 'courseName' | 'noteTitle' | 'noteHtml' | 'noteBreadcrumb' |
  'permissions' | 'durationValue' | 'durationUnit'
>;

const AdminContext = createContext<AdminContextType | undefined>(undefined);

function durationToMs(value: number, unit: 'hours' | 'days' | 'months'): number {
  if (unit === 'hours') return value * 60 * 60 * 1000;
  if (unit === 'days') return value * 24 * 60 * 60 * 1000;
  return value * 30 * 24 * 60 * 60 * 1000;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userEmail = user?.email?.toLowerCase() || '';
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(userEmail);

  const [firestoreAdminEmails, setFirestoreAdminEmails] = useState<string[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [allSentShares, setAllSentShares] = useState<ShareRequest[]>([]);
  const [loadingSentShares, setLoadingSentShares] = useState(false);
  const [allReceivedShares, setAllReceivedShares] = useState<ShareRequest[]>([]);

  const adminEmails = [...new Set([...SUPER_ADMIN_EMAILS, ...firestoreAdminEmails])];
  const isAdmin = adminEmails.includes(userEmail);

  const now = Date.now();
  const pendingShares = allReceivedShares.filter(
    s => s.status === 'pending' && s.pendingExpiresAt > now
  );
  const acceptedShares = allReceivedShares.filter(
    s => s.status === 'accepted' && (!s.actualExpiresAt || s.actualExpiresAt > now)
  );
  const sentShares = allSentShares;

  // Load admin list from Firestore
  useEffect(() => {
    const ref = doc(db, 'adminConfig', 'adminList');
    const unsub = onSnapshot(ref, snap => {
      setFirestoreAdminEmails(
        snap.exists() ? (snap.data().emails || []).map((e: string) => e.toLowerCase()) : []
      );
      setLoadingAdmins(false);
    }, () => setLoadingAdmins(false));
    return () => unsub();
  }, []);

  // Load sent shares (admin)
  useEffect(() => {
    if (!user || !isAdmin) { setAllSentShares([]); return; }
    setLoadingSentShares(true);
    const q = query(collection(db, 'shareRequests'), where('fromAdminUid', '==', user.id));
    const unsub = onSnapshot(q, snap => {
      const shares = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShareRequest));
      setAllSentShares(shares.sort((a, b) => b.sentAt - a.sentAt));
      setLoadingSentShares(false);
    }, () => setLoadingSentShares(false));
    return () => unsub();
  }, [user?.id, isAdmin]); // eslint-disable-line

  // Load received shares (user as recipient)
  useEffect(() => {
    if (!user?.email) { setAllReceivedShares([]); return; }
    const q = query(collection(db, 'shareRequests'), where('toEmail', '==', user.email.toLowerCase()));
    const unsub = onSnapshot(q, snap => {
      setAllReceivedShares(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShareRequest)));
    }, () => {});
    return () => unsub();
  }, [user?.email]);

  const addAdmin = async (email: string) => {
    const e = email.trim().toLowerCase();
    const ref = doc(db, 'adminConfig', 'adminList');
    const snap = await getDoc(ref);
    const existing: string[] = snap.exists() ? (snap.data().emails || []) : [];
    if (!existing.includes(e)) {
      await setDoc(ref, { emails: [...existing, e] }, { merge: true });
    }
  };

  const removeAdmin = async (email: string) => {
    const e = email.trim().toLowerCase();
    if (SUPER_ADMIN_EMAILS.includes(e)) return;
    const ref = doc(db, 'adminConfig', 'adminList');
    const snap = await getDoc(ref);
    const existing: string[] = snap.exists() ? (snap.data().emails || []) : [];
    await setDoc(ref, { emails: existing.filter(x => x !== e) }, { merge: true });
  };

  const sendShare = async (params: SendShareParams) => {
    if (!user) return;
    const ts = Date.now();
    const pendingExpiresAt = ts + durationToMs(params.durationValue, params.durationUnit);
    const payload: Record<string, unknown> = {
      ...params,
      toEmail: params.toEmail.toLowerCase(),
      fromAdminUid: user.id,
      fromAdminEmail: user.email,
      fromAdminName: user.name,
      status: 'pending',
      sentAt: ts,
      pendingExpiresAt,
    };
    // Firestore rejects `undefined` field values (e.g. courseId/courseName when
    // sharing a note, or noteTitle/noteHtml when sharing a course) — strip them
    // out instead of sending them, otherwise addDoc() throws and the Send
    // button silently does nothing.
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) delete payload[key];
    }
    await addDoc(collection(db, 'shareRequests'), payload);
  };

  const updateSharePermissions = async (shareId: string, permissions: SharePermissions) => {
    await updateDoc(doc(db, 'shareRequests', shareId), { permissions });
  };

  const cancelShare = async (shareId: string) => {
    await updateDoc(doc(db, 'shareRequests', shareId), { status: 'declined' });
  };

  const acceptShare = async (shareId: string) => {
    const share = pendingShares.find(s => s.id === shareId);
    if (!share) return;
    const ts = Date.now();
    const actualExpiresAt = ts + durationToMs(share.durationValue, share.durationUnit);
    await updateDoc(doc(db, 'shareRequests', shareId), {
      status: 'accepted',
      acceptedAt: ts,
      actualExpiresAt,
    });
  };

  const declineShare = async (shareId: string) => {
    await updateDoc(doc(db, 'shareRequests', shareId), { status: 'declined' });
  };

  return (
    <AdminContext.Provider value={{
      isAdmin, isSuperAdmin, adminEmails, loadingAdmins,
      addAdmin, removeAdmin,
      sendShare, sentShares, loadingSentShares,
      updateSharePermissions, cancelShare,
      pendingShares, acceptShare, declineShare,
      acceptedShares,
    }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
