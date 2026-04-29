import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import { Layout } from '@/components/Layout';
import { Plus, FileText, Trash2, Pencil, Check, X, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, ConfirmModal } from '@/components/ui';
import { format } from 'date-fns';

export function NotesIndex() {
  const { notePagesIndex, createNotePage, renameNotePage, deleteNotePage } = useStudy();
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const startCreate = () => {
    const id = createNotePage();
    setLocation(`/notes/${id}`);
  };

  return (
    <Layout>
      <div className="p-5">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('notePagesTitle')}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">A4 · {t('addText')} · {t('addLink')} · {t('addImage')} · {t('addPdf')}</p>
          </div>
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              variant="primary"
              className="py-2 px-3 h-auto rounded-xl text-xs gap-1.5 shadow-md"
              onClick={startCreate}
            >
              <Plus size={16} /> {t('createNotePage')}
            </Button>
          </motion.div>
        </motion.header>

        {notePagesIndex.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center px-6"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="mb-6 w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center"
            >
              <FileText size={36} className="text-primary" />
            </motion.div>
            <h2 className="font-bold text-foreground mb-2">{t('notePagesTitle')}</h2>
            <p className="text-xs text-muted-foreground mb-6 max-w-xs">{t('notePagesEmpty')}</p>
            <Button variant="primary" onClick={startCreate} className="rounded-xl">
              <Plus size={16} /> {t('createNotePage')}
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AnimatePresence>
              {notePagesIndex.map(np => (
                <motion.div
                  key={np.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="bg-card border border-border/60 rounded-2xl overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* A4 thumbnail */}
                  <button
                    type="button"
                    onClick={() => setLocation(`/notes/${np.id}`)}
                    className="block w-full aspect-[210/297] max-h-40 bg-gradient-to-br from-white to-secondary/20 border-b border-border/60 relative overflow-hidden"
                  >
                    <FileText size={36} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-border" />
                    {np.pageCount > 1 && (
                      <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        {np.pageCount}p
                      </span>
                    )}
                  </button>

                  {/* Title bar */}
                  <div className="p-3">
                    {editingId === np.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={e => setDraftTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              renameNotePage(np.id, draftTitle);
                              setEditingId(null);
                            }
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-sm font-bold"
                        />
                        <button
                          onClick={() => { renameNotePage(np.id, draftTitle); setEditingId(null); }}
                          className="text-primary"
                        ><Check size={15} /></button>
                        <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X size={15} /></button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLocation(`/notes/${np.id}`)}
                        className="w-full text-left text-sm font-bold text-foreground truncate hover:text-primary transition-colors"
                      >
                        {np.title || t('untitledPage')}
                      </button>
                    )}
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Calendar size={9} />
                        {format(new Date(np.updatedAt), 'MMM d, HH:mm')}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => { setEditingId(np.id); setDraftTitle(np.title); }}
                          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
                          aria-label="rename"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(np.id)}
                          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-rose-600 transition-colors"
                          aria-label="delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await deleteNotePage(confirmDelete);
          setConfirmDelete(null);
        }}
        title={t('deletePage')}
        message={t('deletePageConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        isDanger
      />
    </Layout>
  );
}
